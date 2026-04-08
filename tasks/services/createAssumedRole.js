const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');

/**
 * Creates a temporary credential and session token using a role ARN
 * @param {string} region The region
 * @param {string} roleArn The role ARN
 * @param {string} sessionName The temporary session name
 * @returns {string} The temporary session token
 */
exports.createAssumedRole = async function(region, roleArn, sessionName = "temporaryAWSSession") {
  const stsClient = new STSClient({ region: region });

  // 1. Assume the Role
  const assumeRoleParams = {
    RoleArn: roleArn,
    RoleSessionName: sessionName,
  };

  const { Credentials } = await stsClient.send(new AssumeRoleCommand(assumeRoleParams));

  return Credentials;
}