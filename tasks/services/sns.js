var _ = require("lodash"),
    async = require("async"),
    { createAssumedRole } = require("./createAssumedRole");

const { SNS } = require("@aws-sdk/client-sns");

module.exports = function(grunt) {

  //sns description
  var DESC = "grunt-aws's sns";

  //sns defaults (none at the moment)
  var DEFAULTS = {};

  //sns task
  grunt.registerTask("sns", DESC, async function() {

    //get options
    var opts = this.options(DEFAULTS);

    if(_.isEmpty(opts.target))
      return grunt.log.ok("No target specified");

    if(_.isEmpty(opts.message))
      return grunt.log.ok("No message specified");

    if(_.isEmpty(opts.subject))
      return grunt.log.ok("No subject specified");

    //mark as async
    var done = this.async();

    //create a temporary token from an assumed role
    if (opts.assumeRole) {
      const credentials = await createAssumedRole(opts.region, opts.assumeRole, opts.roleSessionName);
      opts.accessKeyId - credentials.AccessKeyId;
      opts.secretAccessKey = credentials.SecretAccessKey;
      opts.sessionToken = credentials.SessionToken;
    }

    //sns client
    var sns = new SNS({
      credentials: {
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
        sessionToken: opts.sessionToken
      },
      region: opts.region
    });

    //create records defined in opts.invalidations
    publishTopic(done);

    //------------------------------------------------

    function publishTopic(callback) {
      var params = {
        TargetArn: opts.target,
        Message: opts.message,
        Subject: opts.subject
      };
      sns.publish(params, function(err, data) {
        if (err) console.log(err, err.stack);
        else console.log(data);
        callback(err);
      });
    }
  });


};
