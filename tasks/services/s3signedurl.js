const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand, S3 } = require('@aws-sdk/client-s3');

module.exports = function(grunt) {

    grunt.registerMultiTask("s3signedurl", "S3 Signed Url Generator", async function() {

        var done = this.async();

        var DEFAULTS = {
            expiry: 2592000
        };

        var opts = this.options(DEFAULTS);

        var s3 = new S3({
            credentials: {
                accessKeyId: opts.accessKeyId,
                secretAccessKey: opts.secretAccessKey
            }
        });

       const url = await getSignedUrl(s3, new GetObjectCommand({
            Bucket: opts.bucket,
            Key: opts.key
        }), {
            expiresIn: opts.expiry
        });

            console.log("The URL is", url);

        done();



    });

};