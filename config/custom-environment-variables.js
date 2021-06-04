// Custom Environment Variables, for more information see:
// https://github.com/lorenwest/node-config/wiki/Environment-Variables#custom-environment-variables

const config = {};

// The transform filename in transform folder.
config.transform = 'TRANSFORM';

// Boolean that indicates if ALL records should be retrieved
// Defining as object means the environment variable is parsed according to the format in __format.
// Using json meansthe true/false environment variable STRINGS are parsed to booleans.
config.allRecords = {
  __name: 'ALLRECORDS',
  __format: 'json',
};

config.output = {};
// Boolean that indicates if the raw JSON should be saved.
// Defining as object means the environment variable is parsed according to the format in __format.
// Using json meansthe true/false environment variable STRINGS are parsed to booleans.
config.output.includeRawdata = {
  __name: 'INCLUDERAWDATA',
  __format: 'json',
};

config.request = {};
config.request.bearer = 'BEARER';
// Base URI to Percipio API
config.request.baseURL = 'BASEURL';
// Request Path Parameters
config.request.path = {};
/**
 * Name: orgId
 * Description: Organization UUID
 * Required: true
 * Type: string
 * Format: uuid
 */
config.request.path.orgId = 'ORGID';

module.exports = config;
