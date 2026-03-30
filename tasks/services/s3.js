const path = require("path"),
    async = require("async"),
    _ = require("lodash"),
    fs = require("fs"),
    crypto = require("crypto"),
    zlib = require("zlib"),
    CacheMgr = require("../cache-mgr");
    //mime = require("mime").default;
let mime;

const loadModule = async () => {
  mime = await import('mime');
  // Use someModule here
};
loadModule();

const { S3 } = require('@aws-sdk/client-s3');

module.exports = async function(grunt) {

  

  //s3 description
  let DESC = "grunt-aws's s3 task for easy deploys";

  //s3 defaults
  let DEFAULTS = {
    access: 'public-read',
    concurrent: 20,
    cacheTTL: 60*60*1000,
    // deleteFirst: true,
    // deleteMatched: true,
    dryRun: false,
    gzip: true,
    cache: true,
    overwrite: true,
    createBucket: false,
    enableWeb: false,
    signatureVersion: 'v4',
    assumeRole: false
  };

  

  //Action taking place.
  let action = "Put";

  //s3 task
  grunt.registerMultiTask("s3", DESC, async function() {
   
    //normalize files array (force expand)
    let files = [];
    this.files.forEach(function(file) {
      let cwd = file.cwd || '';
      files = files.concat(file.src.map(function(src) {
        let s = path.join(cwd, src),
            d = (cwd||file.src.length>1) ? ((file.dest||'')+src) : file.dest || src;
        return {src: s, dest: d};
      }));
    });

    //skip directories since there are only files on s3
    files = files.filter(function(file) {
      return !grunt.file.isDir(file.src);
    });

    //mark as async
    let done = this.async();

    //dynamic import due to grunt being old and not supporting ES.
    const mimeModule = await import('mime');
    const mime = mimeModule.default;
    
    //get options
    let opts = this.options(DEFAULTS);

    //checks
    if(!opts.bucket)
      grunt.fail.warn("No 'bucket' has been specified");

    //custom mime types
    //if(typeof opts.mime === 'object')
    //  mime.define(opts.mime);
    //if(typeof opts.mimeDefault === 'string')
    //  mime.default_type = opts.mimeDefault;

    //whitelist allowed keys
    /*AWS.config.update(_.pick(opts,
      'sessionToken',
      'region',
      'sslEnabled',
      'maxRetries',
      'httpOptions'
    ), true);

    if (opts.assumeRole !== true) {
      AWS.config.update(_.pick(opts,
        'accessKeyId',
        'secretAccessKey'
      ));
    }*/

    //s3 client
    let s3 = new S3({
      credentials: {
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey
      },
      region: opts.region,
    });

    //dry run prefix
    let DRYRUN = opts.dryRun ? "[DRYRUN] " : "";

    //retrieve cache for this bucket
    let cache = CacheMgr.get(opts.bucket);

    if(!cache.options)
      cache.options = {};
    if(!cache.prefixes)
      cache.prefixes = {};
    if(!cache.files)
      cache.files = {};

    //base object (lacks Body and Key)
    let baseObject = {
      ACL: opts.access,
      Bucket: opts.bucket
    };

    //set gzip encoding
    if(opts.gzip)
      baseObject.ContentEncoding = 'gzip';

    //use allowed headers
    if(typeof opts.headers === 'object')
      _.extend(baseObject, _.pick(
        opts.headers,
        //http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/s3.html#putObject-property
        'ContentLength',
        'ContentType',
        'ContentDisposition',
        'ContentEncoding',
        'CacheControl',
        'Expires',
        'GrantFullControl',
        'GrantRead',
        'GrantReadACP',
        'GrantWriteACP',
        'ServerSideEncryption',
        'StorageClass',
        'WebsiteRedirectLocation'
      ));

    //convert numbers and dates
    if(typeof baseObject.CacheControl === 'number')
      baseObject.CacheControl = "max-age="+baseObject.CacheControl+", public";
    else if (typeof baseObject.CacheControl === 'object') {
      let val = baseObject.CacheControl,
          maxage = val.MaxAge || null,
          swr = val.StaleWhileRevalidate || null;
      if (!maxage) {
        grunt.fail.warn("max_age is required for Cache-Control header");
      }
      if (swr) {
        baseObject.CacheControl = "max-age="+maxage+", stale-while-revalidate="+swr+", public";
      } else {
        baseObject.CacheControl = "max-age="+maxage+", public";
      }
    }

    if(baseObject.Expires instanceof Date)
      baseObject.Expires = baseObject.Expires.toUTCString();

    //use meta data headers
    if(typeof opts.meta === 'object')
      baseObject.Metadata = opts.meta;

    //calculate options hash
    let optionsHash = hash(JSON.stringify(baseObject), 'sha256');
    let currOptionsHash = cache.options[this.target];

    //maintain stats
    let stats = { puts: 0, dels: 0, refreshed: false, newOptions: optionsHash !== currOptionsHash };

    if(stats.newOptions)
      cache.options[this.target] = optionsHash;

    let subtasks = [];

    //create the bucket if it does not exist
    if(opts.createBucket)
      subtasks.push(createBucket);

    //enable webhosting
    if(opts.enableWeb)
      subtasks.push(enableWebHosting);

    if(!opts.cache && files.length)
      subtasks.push(getFileList);

    if(files.length)
      subtasks.push(copyAllFiles);

    //start!
    async.series(subtasks, taskComplete);

    //------------------------------------------------

    function createBucket(callback) {
      let params = {
        Bucket: opts.bucket,
        ACL: opts.access
      };
      if (opts.region && opts.region !== 'us-east-1')
          params.CreateBucketConfiguration = { LocationConstraint: opts.region };
      //check the bucket doesn't exist first
      s3.listBuckets({}, function(err, data){
        if(err) {
          err.message = 'createBucket:s3.listBuckets: ' + err.message;
          return callback(err);
        }
        let existingBucket = _.detect(data.Buckets, function(bucket){
          return opts.bucket === bucket.Name;
        });
        if(existingBucket){
          grunt.log.writeln('Existing bucket found.');
          callback();
        }else{
          grunt.log.writeln('Creating bucket ' + opts.bucket + '...');
          //create the bucket using the bucket, access and region options
          if (opts.dryRun) return callback();
          s3.createBucket(params, function(err, data){
            if(err) {
              err.message = 'createBucket:s3.listBuckets:s3.createBucket: ' + err.message;
              return callback(err);
            }
            grunt.log.writeln('New bucket\'s location is: ' + data.Location);
            // Disable caching if bucket is newly created
            opts.cache = false;
            callback();
          });
        }
      });
    }

    function enableWebHosting(callback) {
      let defaultWebOptions = {
        "grunt-overwrite": false,
        IndexDocument: { Suffix : 'index.html' }
      };
      let webOptions = _.isObject(opts.enableWeb) ? opts.enableWeb : defaultWebOptions;

      s3.getBucketWebsite({ Bucket:opts.bucket }, function(err){
        if ((err && err.name === 'NoSuchWebsiteConfiguration') || webOptions["grunt-overwrite"]){
          delete webOptions["grunt-overwrite"];
          //opts.enableWeb can be the params for WebsiteRedirectLocation.
          //Otherwise, just set the index.html as default suffix
          grunt.log.writeln('Enabling website configuration on ' + opts.bucket + '...');
          if (opts.dryRun) return callback();
          s3.putBucketWebsite({
            Bucket: opts.bucket,
            WebsiteConfiguration: webOptions
          }, callback);
        } else {
          if(err){
            err.message = 'enableWebHosting:s3.getBucketWebsite: ' + err.message;
          }
          return callback(err);
        }
      });
    }

    function getFileList(callback) {
      //calculate prefix
      let prefix = null, pindex = Infinity;
      files.forEach(function(file) {
        if(prefix === null) {
          prefix = file.dest;
          return;
        }
        let i = 0;
        while(i < prefix.length &&
              i < file.dest.length &&
              file.dest.charAt(i) === prefix.charAt(i)) i++;
        pindex = Math.min(i, pindex);
      });
      prefix = prefix.substr(0, pindex);

      //get prefix's earliest refresh time
      let refreshedAt = 0;
      for(let p in cache.prefixes)
        if(prefix.indexOf(p) === 0)
          refreshedAt = Math.max(refreshedAt, cache.prefixes[p]);

      //already have list
      if(cache.files &&
         refreshedAt &&
         opts.cacheTTL &&
         opts.cacheTTL > (Date.now() - refreshedAt)) {
        grunt.verbose.writeln("Using cached object list prefixed with '" + prefix + "'");
        return callback();
      }

      //fetch all objects, beginning with key ''
      fetchObjects('');

      function fetchObjects(marker) {
        let msg = "Retrieving list of existing objects";
        msg += prefix ? " prefixed with '" + prefix + "'" : "";
        msg += marker ? (" after '" + marker + "'") : "";
        msg += "...";
        grunt.log.writeln(msg);

        s3.listObjects({
          Bucket: opts.bucket,
          Marker: marker,
          Prefix: prefix
        }, function(err, objs) {
          if(err) {
            err.message = 'getFileList:fetchObjects:s3.listObjects: ' + err.message;
            return callback(err);
          }

          //store results
          objs.Contents.forEach(function(obj) {
            cache.files[obj.Key] = JSON.parse(obj.ETag);
          });
          cache.prefixes[prefix] = Date.now();
          stats.refreshed = true;

          if(objs.IsTruncated)
            fetchObjects(objs.Contents.pop().Key);
          else
            callback();
        });
      }
    }

    function copyAllFiles(callback) {
      //asynchrously loop through all files
      async.eachLimit(files, opts.concurrent, getFile, callback);
    }

    function getFile(file, callback) {
      //extract src and dest
      let src = file.src,
          contents = fs.readFileSync(src),
          dest = file.dest;

      if(opts.gzip) {
        zlib.gzip(contents, function(err, compressed) {
          copyFile(src, compressed, dest, callback);
        });
      } else {
        copyFile(contents, contents, dest, callback);
      }
    }

    function copyFile(src, contents, dest, callback) {

      //skip existing files
      let etag = cache.files[dest];
      if(opts.cache &&
         !stats.newOptions &&
         etag && etag === hash(contents, 'md5')) {
        grunt.log.ok(DRYRUN + "No change '" + dest + "'");
        callback();
        return;
      }

      if(!opts.overwrite && etag) {
        grunt.log.ok(DRYRUN + "File already exists '" + dest + "'");
        callback();
        return;
      }

      //fake successful upload
      if(opts.dryRun)
        return putComplete();

      //extend the base object
      let object = Object.assign({},baseObject);
      object.Key = dest;


      if(!object.ContentType)
        object.ContentType = mime.getType(dest);

      // Set the charset, default text type mime types to UTF-8
      if (opts.charset) object.ContentType += '; charset=' + opts.charset;

      if (opts.copyFrom || opts.copyFile) {
        if (opts.copyFrom) {
          let copySource = src.split('/');
          copySource[0] =  opts.copyFrom;
          copySource = copySource.join('/');
        } else {
          copySource = opts.copyFile;
        }
        object.MetadataDirective  = "REPLACE";
        object.CopySource = copySource;
        action = "Copy";
        s3.copyObject(object, putComplete)
      } else {
        //upload!
        object.Body = contents;
        s3.putObject(object, putComplete);
      }

      function putComplete(err, results) {
        if(err) {
          return callback("Put '" + dest + "' failed...\n" + err + "\n ");
        }
        grunt.log.ok(DRYRUN + action + " '" + dest + "'");
        if(!opts.dryRun)
          stats.puts++;
        if(results)
          cache.files[dest] = JSON.parse(results.ETag);

        if(stats.puts % 5 == 0) {
          // Periodically update the cache
          CacheMgr.put(cache);
        }

        callback();
      }

    }

    function taskComplete(err) {
      if(err) {
        grunt.fail.warn(err);
        return done(false);
      }

      //all done
      grunt.log.ok(action + " " + stats.puts + " files");
      if(opts.cache && (stats.puts || stats.dels || stats.refreshed || stats.newOptions))
        CacheMgr.put(cache);
      done(err);
    }
  });
};

//helper functions
function hash(buff, algo) {
  let h = crypto.createHash(algo);
  h.update(buff);
  return h.digest('hex');
}
