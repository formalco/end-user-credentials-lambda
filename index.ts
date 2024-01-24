import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import axios from 'axios';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const apiUrl = 'https://adminv2.api.formalcloud.net/admin.v1.UserService/CreateHumanUserAuthToken';
const FORMAL_API_KEY_SECRET_ID = 'formal-api-key';
let FORMAL_API_KEY = '';
const client = new SecretsManagerClient();

interface Response {
  username: string;
  token: string;
  expiresAt: string;
}

async function getAuthToken(apiKey: string, email: string): Promise<Response> {
  try {
    const requestData = { 
      email: email 
    };
    const res = await axios.post(apiUrl, requestData, {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
    })
    return {
      token: res.data.token,
      username: res.data.username,
      expiresAt: res.data.expiresAt,
    }
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

function isValidEmail(email: string): boolean {
  const emailRegex = new RegExp(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/);
  return emailRegex.test(email);
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!FORMAL_API_KEY) {
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: FORMAL_API_KEY_SECRET_ID,
      }),
    );
    if (!response.SecretString) {
      return {
        statusCode: 400,
        body: JSON.stringify(
          {
            message: 'Missing FORMAL_API_KEY',
          },
          null,
          2
        ),
      };
    }
    FORMAL_API_KEY = response.SecretString;
  }


  let userId = event?.requestContext?.authorizer?.iam?.userId
  if (!userId) {
    userId  = event?.requestContext?.identity?.caller
  }

  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify(
        {
          message: 'Missing userId',
        },
        null,
        2
      ),
    };
  }
  const split = userId.split(':')
  if (split.length !== 2) {
    return {
      statusCode: 400,
      body: JSON.stringify(
        {
          message: 'Invalid userId',
        },
        null,
        2
      ),
    };
  }
  const email = split[1]
  if (!isValidEmail(email)) {
    return {
      statusCode: 400,
      body: JSON.stringify(
        {
          message: 'Invalid email',
        },
        null,
        2
      ),
    };
  }

  const userToken = await getAuthToken(FORMAL_API_KEY, email)

  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        token: userToken.token,
        username: userToken.username,
        expiresAt: userToken.expiresAt,
      },
      null,
      2
    ),
  };
};