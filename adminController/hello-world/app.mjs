import StatusCodes from "http-status-codes";
import { MongoClient } from "mongodb";

import {
  HTTPError,
  HTTPResponse,
  DBConn,
  catchError,
} from "./utils/helper.mjs";

export const lambdaHandler = async (event) => {
  try {
    const method = event.httpMethod;
    const path = event.path;
    const pathParams = event.pathParameters;
    const body = event.body;
    const queryParams = event.queryStringParameters || {};

    switch (method) {
      case "GET":
        if (path === "/getAllUser") {
          return await getAllUser(queryParams);
        } else if (path === "/getUserChainStats"){
          return await getUserChainStats(queryParams);
        }
      case "PATCH":
        if (path.startsWith("/softDelete/")&& pathParams && pathParams.id){
          return await softDelete(pathParams.id, body)
        }
      default:
        return {
          statusCode: StatusCodes.METHOD_NOT_ALLOWED,
          body: JSON.stringify({
            message: "Endpoint not allowed",
          }),
        };
    }
  } catch (error) {
    console.error("An error occurred:", error);
    return {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      body: JSON.stringify({ message: "Something Went Wrong", error: error }),
    };
  }
};

const getAllUser = async (queryParams) => {
  try {
    const client = await DBConn();
    const db = client.db("10D");
    const usersCollection = db.collection("users");
    const totalUsersCount = await usersCollection.countDocuments();

    const page = Number(queryParams.page) || 1;
    const limit = Number(queryParams.limit) || 10;
    const skip = (page - 1) * limit;

    const users = await usersCollection
      .find({})
      .skip(skip)
      .limit(limit)
      .toArray();

    const userArr = users.map((user) => ({
      userId: user._id,
      userName: user.userName,
      totalNodes: user.totalNode,
      outReach: user.outReach || 0,
      userBalance: user.userWallet ? user.userWallet.userBalance : 0,
    }));

    await client.close();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Success",
        users: userArr,
        totalUsers: totalUsersCount,
      }),
    };
  } catch (error) {
    console.error("An error occurred:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Something Went Wrong",
        error: error.message,
      }),
    };
  }
};

const getUserChainStats = async (queryParams) => {
  try {
    const client = await DBConn();
    const db = client.db("10D");
    const totalUsers = await db.collection("users").countDocuments({});
    let totalChainInvestment = 0;
    const chains = await db.collection("chains").find({}).toArray();

    for (const chain of chains) {
      const collectionName = `treeNodes${chain.name}`;
      const rootNode = await db
        .collection(collectionName)
        .findOne({ _id: chain?.rootNode }, { projection: { totalMembers: 1 } });
      const chainInvestment = rootNode.totalMembers * chain.seedAmount;
      totalChainInvestment += chainInvestment;
    }

    await client.close();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Success",
        totalUsers,
        totalChainInvestment,
      }),
    };
  } catch (error) {
    console.log("an error has occured", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "something went wrong!, try again later",
        error: error.message,
      }),
    };
  }
};

const softDelete = async (userId, requestBody)=>{
  try {
    const requestData = JSON.parse(requestBody);

    const client = await DBConn();
    const db = client.db("10D");
    const userToFind = await db.collection("users").findOne({_id: userId});
    if (!userToFind){
      return {
        statusCode: StatusCodes.NOT_FOUND,
        body: JSON.stringify({
          message: "user not found against this userID"
        })
      }
      // performing soft deleting
      user.isDeleted = true;
      await db.collection("users").updateOne({_id: userId}, {$set: {isDeleted: true}});
      await client.close();

      return {
        statusCode: StatusCodes.OK,
        body: JSON.stringify({
          message: "user soft-deleteing action performed successfully!"
        })
      }
    }

  } catch (error) {
  console.log("an error occured", error);
  return {
    statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    body: JSON.stringify({
      message: "something went wrong!"
    })
  } 
  }

}
