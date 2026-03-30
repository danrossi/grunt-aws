
var path = require("path");


module.exports = function(grunt) {

  //grunt.loadNpmTasks("grunt-aws");

  grunt.loadTasks(path.join("../","tasks", "services"));

  grunt.initConfig({

    aws: grunt.file.readJSON("aws-credentials.json"),

    s3: {
      options: {
        accessKeyId: "<%= aws.accessKeyId %>",
        secretAccessKey: "<%= aws.secretAccessKey %>",
        bucket: "<%= aws.bucket %>",
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
      }
    },

    cloudfront: {
      options: {
        accessKeyId: "<%= aws.accessKeyId %>",
        secretAccessKey: "<%= aws.secretAccessKey %>",
        distributionId: "...",
        invalidations: [
          "/index.html"
        ]
      },
      invalidate: {}
    },

    sns: {
      options: {
        accessKeyId: "<%= aws.accessKeyId %>",
        secretAccessKey: "<%= aws.secretAccessKey %>",
        region: "...",
        target: "...",
        message: "...",
        subject: "..."
      }
    }

  });

  grunt.registerTask("default", ["s3"]);
};
