# node-percipio-metadatadownload

Retrieves metadata about the available content items from Percipio, transforms the Percipio JSON response using JSONata and save as Comma Delimited Text File (CSV)

To use this code you will need:

1. A Skillsoft [Percipio](https://www.skillsoft.com/platform-solution/percipio/) Site
1. A [Percipio Service Account](https://documentation.skillsoft.com/en_us/pes/Integration/Understanding-Percipio/rest-api/pes_authentication.htm) with permission for accessing the [CONTENT DISCOVERY API](https://documentation.skillsoft.com/en_us/pes/Integration/Understanding-Percipio/rest-api/pes_rest_api.htm)
   <br/><br/>

# Configuration

## Creating a JSONata transform

The code uses the [JSONata-Extended](https://www.npmjs.com/package/jsonata-extended) package to transform the JSON returned by Percipio.

The transform needs to create a flattened object with no nested data, the key values are used as column names in the generated CSV. So for example:

```
{
  "Column 1": "foo",
  "Column 2": "bar",
  "Column 3": "Lorem ipsum dolor sit amet."
}
```

would generate CSV:

```
"Column 1","Column 2","Column 3"
"foo","bar","Lorem ipsum dolor sit amet."
```

The [transform/default.jsonata](transform/default.jsonata) shows some ideas for basic processing of the returned JSON from Percipio.

## Environment Configuration

Set the following environment variables, or use the [.env](.env) file

| ENV        | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ORGID      | Required | This is the Percipio Organiation UUID for your Percipio Site.                                                                                                                                                                                                                                                                                                                                                             |
| BEARER     | Required | This is the Percipio Bearer token for the Service Account.                                                                                                                                                                                                                                                                                                                                                                |
| BASEURL    | Required | This is set to the base URL for the appropriate Percipio data center. For US hosted use: https://api.percipio.com For EU hosted use: https://dew1-api.percipio.com                                                                                                                                                                                                                                                        |
| TRANSFORM  | Optional | This is the path to the JSONata transform to use. The default is [transform/default.jsonata](transform/default.jsonata)                                                                                                                                                                                                                                                                                                   |
| ALLRECORDS | Optional | This controls whether all the records are retrieved. The default is **false** which means the date from the [lastrun.json](lastrun.json) file, if it exists, is used as the updatedSince filter for the [API](https://api.percipio.com/content-discovery/api-docs/#/Content/getCatalogContentV2) to retrieve just the changes since that date. If **true** or file does not exist then updatedSince filter is set to null and all records are retrieved. |

<br/>

# Running the application

After ensuring the configuration is complete, and **npm install** has been run you can simply run the app:

```bash
npm start
```

or

```bash
node ./app.js
```

The Percipio [API](https://api.percipio.com/content-discovery/api-docs/#/Content/getCatalogContentV2) wil be called repeatedly to download all available content items.

The Percipio JSON data returned will then be transformed using the transform specified, the [default.jsonata](transform/default.jsonata) shows some ideas for basic processing of the returned JSON from Percipio.

The transformed JSON will then be saved in CSV format, with UTF-8 encoding to:

```
results/YYYYMMDD_hhmmss_results.csv
```

The timestamp component is based on UTC time when the script runs:

| DATEPART | COMMENTS                            |
| -------- | ----------------------------------- |
| YYYY     | Year (i.e. 1970 1971 ... 2029 2030) |
| MM       | Month Number (i.e. 01 02 ... 11 12) |
| DD       | Day (i.e. 01 02 ... 30 31)          |
| HH       | Hour (i.e. 00 01 ... 22 23)         |
| mm       | Minutes (i.e. 00 01 ... 58 59)      |
| ss       | Seconds (i.e. 00 01 ... 58 59)      |

## Changelog

Please see [CHANGELOG](CHANGELOG.md) for more information what has changed recently.

## License

MIT © martinholden-skillsoft
