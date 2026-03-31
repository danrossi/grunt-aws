const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand, S3 } = require('@aws-sdk/client-s3');

module.exports = function(grunt) {

    grunt.registerMultiTask("s3signedurl", "S3 Signed Url Generator", async function() {

        var done = this.async();

        var DEFAULTS = {
            expiry: 86400,
             //dynamically generated name from a callback function
            keyName: null
        };

        var opts = this.options(DEFAULTS);



        var s3 = new S3({
            credentials: {
                accessKeyId: opts.accessKeyId,
                secretAccessKey: opts.secretAccessKey
            },
            region: opts.region
        });


       let keys = this.data.keys || [ { key: opts.keyName ? opts.keyName() : this.data.key }];



        await Promise.all(keys.map(async function(file) {
            return new Promise(async function(resolve, reject) {
        

                console.log("Upload file ", file.key);
        
        
                const url = await getSignedUrl(s3, new GetObjectCommand({
                    Bucket: opts.bucket,
                    Key: file.key
                }), {
                    expiresIn: opts.expiry
                });

                console.log("The URL is", url);

                resolve();
                

            

        
                
            });
            


        }));


        done();



    });

};