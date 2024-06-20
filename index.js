const fs = require('node:fs/promises');
const readline = require('node:readline/promises');
const { createReadStream } = require('node:fs');

// Load environment variables from .env file into `process.env`
require('dotenv').config();

// Retreive environment variables
const BASE_URL = process.env.BASE_URL;
const USER_CREDENTIAL = `${process.env.USERNAME}:${process.env.PASSWORD}`;
const INSTANCE_CSV = process.env.INSTANCE_CSV;
const ACTIVITY_STREAM_DIR = process.env.ACTIVITY_STREAM_DIR;

// Setup Request Header
const requestHeader = new Headers({
  'Authorization': `Basic ${Buffer.from(USER_CREDENTIAL).toString('base64')}`
});

// Retrieve Integration Instances
// Please see detail:
// https://docs.oracle.com/en/cloud/paas/integration-cloud/rest-api/op-ic-api-integration-v1-monitoring-instances-get.html
async function getInstances(limit, offset, q) {
  const options = {
    method: 'GET',
    headers: requestHeader,
  };
  const params = new URLSearchParams({
    'limit': limit,
    'offset': offset,
    'q': q
  });
  const response = await fetch(`${BASE_URL}/monitoring/instances?${params}`, options);
  if (!response.ok) {
    const json = await response.json();
    throw new Error(`${json.status} - ${json.title}`);
  }
  return response;
}

// Retrieve Integration Instance Activity Stream
// Please see detail:
// https://docs.oracle.com/en/cloud/paas/integration-cloud/rest-api/op-ic-api-integration-v1-monitoring-instances-id-activitystream-get.html
async function getActivityStream(id) {
  const options = {
    method: 'GET',
    headers: requestHeader,
  };
  const response = await fetch(`${BASE_URL}/monitoring/instances/${id}/activityStream`, options);
  if (!response.ok) {
    const json = await response.text();
    throw new Error(`${json.status} - ${json.title}`);
  }
  return response;
}

(async () => {
  // Retrieve All Integration Instances and Output to CSV File
  const limit = 100;  // Query Prameter `limit`
  let offset = 0; // Query Parameter: `offset`
  const q = `{timewindow:'RETENTIONPERIOD'}`; // Query Parameter: `q`
  let totalRecordsCount = undefined;
  while (totalRecordsCount === undefined || offset < totalRecordsCount) {
    const response = await getInstances(limit, offset, q);
    const json = await response.json();
    totalRecordsCount = json.totalRecordsCount || json.totalResults;
    const items = json.items;
    for (let i = 0; i < items.length; i++) {
      fs.appendFile(INSTANCE_CSV, `${items[i].id},${items[i].date}, ${items[i].integrationName},${items[i].integrationVersion},${items[i].status}\n`, 'utf-8');
    }
    offset += limit;
  }

  // Retrieve Integration Instance Activity Stream and Output to JSON File
  const input = createReadStream(INSTANCE_CSV);
  const rl = readline.createInterface({ input: input });
  for await (const line of rl) {
    const values = line.split(',');
    const status = values[4];
    if (status === 'SCHEDULE_WAITING') {
      continue;
    }
    const id = values[0];
    const response = await getActivityStream(id);
    const json = await response.json();
    await fs.writeFile(`${ACTIVITY_STREAM_DIR}/activityStream-${id}.json`, JSON.stringify(json, null, '  '));
  }
})();