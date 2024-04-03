// utils/helper.mjs

import StatusCodes from "http-status-codes";
import { MongoClient } from "mongodb";

// DB Connection
export const DBConn = async () => {
  try {
    const encryptedClient = new MongoClient(process.env.MONGODB_URL, {});
    await encryptedClient.connect();
    console.log("db connected");
    return encryptedClient;
  } catch (err) {
    console.error("Database connection error:", err);
    throw err;
  }
};

// Error Handling
export class HTTPError extends Error {
  code;
  details;

  constructor(message = "Error", errorCode, details = []) {
    super();
    this.message = message;
    this.code = errorCode;
    this.details = details;
  }
}

export class HTTPResponse {
  message;
  data;

  constructor(message = "Success", data) {
    this.message = message;
    this.data = data;
  }
}

// Catch Error Function
export const catchError = async (error) => {
  console.error("An error occurred:", error);
  let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
  let errorMessage = "Something Went Wrong";
  
  if (error instanceof HTTPError) {
    statusCode = error.code || StatusCodes.INTERNAL_SERVER_ERROR;
    errorMessage = error.message;
  }
  
  return {
    statusCode,
    body: JSON.stringify({ message: errorMessage, error: error.message })
  };
};
