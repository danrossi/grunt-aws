const path = require('path');

module.exports = function(grunt) {

  grunt.loadNpmTasks("grunt-aws");
  
  grunt.initConfig({

    aws: grunt.file.readJSON("aws-credentials.json"),

    s3: {
      options: {
        accessKeyId: "<%= aws.accessKeyId %>",
        secretAccessKey: "<%= aws.secretAccessKey %>",
        bucket: "<%= aws.bucket %>",
        region: "<%= aws.region %>",
        "access": "private",
        "gzip": true,
        "cache": true,
        "headers": {
          "StorageClass": "REDUCED_REDUNDANCY"
        }
      },
      build: {
        cwd: "build",
        src: "**"
      },
      build2: {
        options: {
          "cache": false,
        },
        cwd: "build2",
        src: "**"
      }
    },
     s3signedurl: {
      options: {
        accessKeyId: "<%= aws.accessKeyId %>",
        secretAccessKey: "<%= aws.secretAccessKey %>",
        bucket: "<%= aws.bucket %>",
        region: "<%= aws.region %>",
        expiry: 86400
      },
      test: {
        //key: "/foo.js",
        keys: [
          { key: "foo.js" }
        ]
      }
    },

    cloudfront: {
      options: {
        accessKeyId: "<%= aws.accessKeyId %>",
        secretAccessKey: "<%= aws.secretAccessKey %>",
        distributionId: "<%= aws.cloudfront_dist_id %>",
        invalidations: [
          "/*"
        ]
      },
      invalidate: {}
    },

    sns: {
      options: {
        accessKeyId: "<%= aws.accessKeyId %>",
        secretAccessKey: "<%= aws.secretAccessKey %>",
        region: "<%= aws.region %>",
        target: "<%= aws.sns_target %>",
        message: 'You got it',
        subject: 'A Notification'
      }
    },
    route53: {
      options: {
        accessKeyId: "<%= aws.accessKeyId %>",
        secretAccessKey: "<%= aws.secretAccessKey %>",
        zones: {
		      "<%= aws.zone %>": [
            {
              name: "<%= aws.zone_name %>",
              type: 'CNAME',
              value: ["<%= aws.zone_value %>"]
            }
          ]
        }
      }
    }

  });

  grunt.registerTask("default", ["s3"]);
};
