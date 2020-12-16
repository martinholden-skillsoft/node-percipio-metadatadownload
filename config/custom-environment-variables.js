// Custom Environment Variables, for more information see:
// https://github.com/lorenwest/node-config/wiki/Environment-Variables#custom-environment-variables

const config = {};

// The transform filename in transform folder.
config.transform = 'TRANSFORM';

// Boolean that indicates if ALL records should be retrieved
config.allRecords = 'ALLRECORDS';

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
