const moment = require('moment');
const defer = require('config/defer').deferConfig;

const config = {};

// The trasnform file to use
config.transform = 'transform/default.jsonata';

// Boolean that indicates if ALL records should be retrieved
// Default is false and last timestamp from lastrun.json
// used as config.request.query.updatedSince value, this allows
// script to be scheduled to run and used to get deltas.
config.allRecords = false;

// Boolean that indicates if the generated CSV should inlcude a UTF-8 Byte Order Marker (BOM)
// Including the BOM makes it easier for the generated CSV to be opened in Microsoft Excel,
// which otherwise will not display extended or double-byte characters correctly.
config.includeBOM = true;

config.startTime = moment().utc();
config.startTimestamp = config.startTime.format('YYYYMMDD_HHmmss');

// DEBUG Options
config.debug = {};
config.debug.path = 'results';
config.debug.filename = defer((cfg) => {
  return `${cfg.startTimestamp}_results.log`;
});

// Default for for saving the output
config.output = {};
config.output.path = 'results';
config.output.filename = defer((cfg) => {
  return `${cfg.startTimestamp}_results.csv`;
});

// Output the raw JSON received
config.output.includeRawdata = false;

config.output.rawdatafilename = defer((cfg) => {
  return `${cfg.startTimestamp}_rawdata.json`;
});

// Request
config.request = {};
// Timeout
config.request.timeout = 60 * 1000;

// Bearer Token
config.request.bearer = null;
// Base URI to Percipio API
config.request.baseURL = null;
// Request Path Parameters
config.request.path = {};
/**
 * Name: orgId
 * Description : Organization UUID
 * Required: true
 * Type: string
 * Format: uuid
 */
config.request.path.orgId = null;

// Request Query string Parameters
config.request.query = {};
/**
 * Name: transformName
 * Description : Value to identify a transform that will map Percipio data into a client
 * specific format
 * Type: string
 */
config.request.query.transformName = null;
/**
 * Name: updatedSince
 * Description : Filter criteria that returns catalog content changes since the date
 * specified in GMT with an ISO format.  Items will be included in the response if the
 * content metadata has changed since the date specified but may also be included if there
 * have been configuration changes that have increased or decreased the number of content
 * items that the organization has access to.
 * Type: string
 * Format: date-time
 */
config.request.query.updatedSince = null;
/**
 * Name: offset
 * Description : Used in conjunction with 'max' to specify which set of 'max' content items
 * should be returned. The default is 0 which returns 1 through max content items. If offset
 * is sent as 1, then content items 2 through max+1 are returned.
 * Type: integer
 */
config.request.query.offset = null;
/**
 * Name: max
 * Description : The maximum number of content items to return in a response. The default is
 * 1000. Valid values are between 1 and 1000.
 * Type: integer
 * Minimum: 1
 * Maximum: 1000
 * Default: 1000
 */
config.request.query.max = 1000;
/**
 * Name: pagingRequestId
 * Description : Used to access the unique dataset to be split among pages of results
 * Type: string
 * Format: uuid
 */
config.request.query.pagingRequestId = null;

// Request Body
config.request.body = null;

// Method
config.request.method = 'get';
// The Service Path
config.request.uritemplate = `/content-discovery/v2/organizations/{orgId}/catalog-content`;

// Global Web Retry Options for promise retry
// see https://github.com/IndigoUnited/node-promise-retry#readme
config.retry_options = {};
config.retry_options.retries = 10;
config.retry_options.minTimeout = 1000;
config.retry_options.maxTimeout = Infinity;

// Global Axios Rate Limiting#
// see https://github.com/aishek/axios-rate-limit
config.ratelimit = {};
config.ratelimit.maxRPS = 4;

module.exports = config;
