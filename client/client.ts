import axios from 'axios';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';

const {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_SESSION_TOKEN
} = process.env;

const apiGatewayUrl = '[REPLACE_WITH_API_ENDPOINT]/crendentials'
const awsRegion = '[REPLACE_WITH_AWS_REGION]'; // e.g. 'us-east-1'

// Create an IAM signer for the request
const sigv4 = new SignatureV4({
  service: 'execute-api',
  region: awsRegion,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID || '',
    secretAccessKey: AWS_SECRET_ACCESS_KEY || '',
    sessionToken: AWS_SESSION_TOKEN,
  },
  sha256: Sha256,
});


const apiUrl = new URL(apiGatewayUrl);

export const handler = async () => {
  try {
    const signed = await sigv4.sign({
      method: 'GET',
      hostname: apiUrl.host,
      path: apiUrl.pathname,
      protocol: apiUrl.protocol,
      headers: {
        'Content-Type': 'application/json',
        host: apiUrl.hostname
      },
    });

    const { data } = await axios({
      ...signed,
      url: apiGatewayUrl 
    });

    console.log('Successfully received data: ', data);
    return data;
  } catch (error) {
    console.log('An error occurred', error);
    throw error;
  }
};

handler();