import StatusCodes from "http-status-codes";
import { MongoClient } from "mongodb";
import { ObjectId } from "mongodb";

import {
  HTTPError,
  HTTPResponse,
  DBConn,
  catchError,
  catchTryAsyncErrors
} from "./utils/helper.mjs";

export const lambdaHandler = async (event) => {
  let client;
  try {
    const method = event.httpMethod;
    const path = event.path;
    const pathParams = event.pathParameters;
    const body = event.body;
    const queryParams = event.queryStringParameters || {};

    client = await DBConn();
    const DB = client.db("10D");

    switch (method) {
      case "GET":
        if (path === "/getAllUser") {
          return await catchTryAsyncErrors(getAllUser)(queryParams, DB);
        } else if (path === "/getUserChainStats") {
          return await catchTryAsyncErrors(getUserChainStats)(queryParams, DB);
        } else if (path === "/searchUser") {
          return await catchTryAsyncErrors(searchUsers)(queryParams, DB);
        }
      case "PATCH":
        if (path.startsWith("/softDelete/") && pathParams && pathParams.id) {
          return await catchTryAsyncErrors(softDelete)(pathParams.id, DB);
        } else if (
          path.startsWith("/updateStatus/") &&
          pathParams &&
          pathParams.id &&
          pathParams.status
        ) {
          return await catchTryAsyncErrors(updateUserStatus)(pathParams.id, pathParams.status, DB);
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
  } finally {
    if (client) {
      await client.close();
    }
  }
};

const getAllUser = async (queryParams, DB) => {
  try {
    const usersCollection = DB.collection("users");
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

const getUserChainStats = async (queryParams, DB) => {
  try {
    const totalUsers = await DB.collection("users").countDocuments({});
    let totalChainInvestment = 0;
    const chains = await DB.collection("chains").find({}).toArray();

    for (const chain of chains) {
      const collectionName = `treeNodes${chain.name}`;
      const rootNode = await DB
        .collection(collectionName)
        .findOne({ _id: chain?.rootNode }, { projection: { totalMembers: 1 } });
      const chainInvestment = rootNode.totalMembers * chain.seedAmount;
      totalChainInvestment += chainInvestment;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Success",
        totalUsers,
        totalChainInvestment,
      }),
    };
  } catch (error) {
    console.log("an error has occurred", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "something went wrong!, try again later",
        error: error.message,
      }),
    };
  }
};

const softDelete = async (userId, DB) => {
  try {
    const userIdObjectId = new ObjectId(userId);
    const userToFind = await DB
      .collection("users")
      .findOne({ _id: userIdObjectId });

    if (!userToFind) {
      console.log("User not found");
      return {
        statusCode: StatusCodes.NOT_FOUND,
        body: JSON.stringify({
          message: "User not found against this userID",
        }),
      };
    }

    // Perform soft deleting
    userToFind.isDeleted = true;
    await DB
      .collection("users")
      .updateOne({ _id: userIdObjectId }, { $set: { isDeleted: true } });
    console.log("User soft-deleted successfully");

    return {
      statusCode: StatusCodes.OK,
      body: JSON.stringify({
        message: "User soft-deleting action performed successfully!",
      }),
    };
  } catch (error) {
    console.error("An error occurred:", error);
    return {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      body: JSON.stringify({
        message: "Something went wrong!",
      }),
    };
  }
};

const updateUserStatus = async (userId, userStatus, DB) => {
  try {
    const userIdObjectId = new ObjectId(userId);
    const userToUpdate = await DB
      .collection("users")
      .findOne({ _id: userIdObjectId });
    if (!userToUpdate) {
      return {
        statusCode: StatusCodes.NOT_FOUND,
        body: JSON.stringify({
          message: " user not found against this _id",
        }),
      };
    }
    // update the status
    userToUpdate.status = userStatus;
    await DB
      .collection("users")
      .updateOne({ _id: userIdObjectId }, { $set: { status: userStatus } });

    return {
      statusCode: StatusCodes.OK,
      body: JSON.stringify({
        message: `user with ${userId}'s status has been updated`,
      }),
    };
  } catch (error) {
    console.log("an error occured", error);
    return {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      body: JSON.stringify({
        message: "something went wrong!",
      }),
    };
  }
};

// searchUsers is incomplete
const searchUsers = async (queryParams, DB) => {
  try {
    const page = Number(queryParams.page) || 1;
    const limit = Number(queryParams.limit) || 10;
    const search = queryParams.search;
    const skip = (page - 1) * limit;

    const pipeline = [
      {
        $lookup: {
          from: "userwallets",
          localField: "userWallet",
          foreignField: "_id",
          as: "userWallet",
        },
      },
      { $unwind: "$userWallet" },
      {
        $match: {
          $or: [
            { firstName: { $regex: new RegExp(search, "i") } },
            { lastName: { $regex: new RegExp(search, "i") } },
            { email: { $regex: new RegExp(search, "i") } },
            { userName: { $regex: new RegExp(search, "i") } },
            { totalNode: { $regex: new RegExp(search, "i") } },
            { "userWallet.userBalance": { $eq: parseInt(search) } },
          ],
        },
      },
      { $skip: skip },
      { $limit: limit },
    ];

    const users = await DB.collection("users").aggregate(pipeline).toArray();
    const totalUsers = await DB.collection("users").countDocuments();

    return {
      statusCode: StatusCodes.OK,
      body: JSON.stringify({
        message: "Success",
        users,
        totalUsers,
      }),
    };
  } catch (error) {
    console.error("An error occurred:", error);
    return {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      body: JSON.stringify({
        message: "Something went wrong!",
        error: error.message,
      }),
    };
  }
};
