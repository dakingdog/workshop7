// Imports the express Node module.
var express = require('express');
//mongodb setup
var ResetDatabase=require('./resetdatabase');
var mongo_express = require('mongo-express/lib/middleware');
var mongo_express_config = require('mongo-express/config.default.js');
var MongoDB = require('mongodb');
var MongoClient = MongoDB.MongoClient;
var ObjectID = MongoDB.ObjectID;
var url = 'mongodb://localhost:27017/facebook';
// Creates an Express server.
var app = express();
// Parses response bodies.
var bodyParser = require('body-parser');
var database = require('./database');
var readDocument = database.readDocument;
var writeDocument = database.writeDocument;
var deleteDocument = database.deleteDocument;
var addDocument = database.addDocument;
var getCollection = database.getCollection;
var StatusUpdateSchema = require('./schemas/statusupdate.json');
var CommentSchema = require('./schemas/comment.json');
var validate = require('express-jsonschema').validate;
function getUserIdFromToken(authorizationLine) {
  try {
    // Cut off "Bearer " from the header value.
    var token = authorizationLine.slice(7);
    // Convert the base64 string to a UTF-8 string.
    var regularString = new Buffer(token, 'base64').toString('utf8');
    // Convert the UTF-8 string into a JavaScript object.
    var tokenObj = JSON.parse(regularString);
    var id = tokenObj['id'];
    // Check that id is a number.
    if (typeof id === 'string') {
      return id;
    } else {
      // Not a number. Return "", an invalid ID.
      return "";
    }
  } catch ( e ) {
    // Return an invalid ID.
    return -1;
  }
}

MongoClient.connect(url, function(err, db) {
  /* body... */


  app.use(bodyParser.text());
  app.use(bodyParser.json());
  app.use(express.static('../client/build'));
  app.use('/mongo_express', mongo_express(mongo_express_config));
  /**
   * Resolves a list of user objects. Returns an object that maps user IDs to
   * user objects.
   */
  function resolveUserObjects(userList, callback) {
    // Special case: userList is empty.
    // It would be invalid to query the database with a logical OR
    // query with an empty array.
    if (userList.length === 0) {
      callback(null, {});
    } else {
      // Build up a MongoDB "OR" query to resolve all of the user objects
      // in the userList.
      var query = {
        $or: userList.map((id) => {
          return {
            _id: id
          }
        })
      };
      // Resolve 'like' counter
      db.collection('users').find(query).toArray(function(err, users) {
        if (err) {
          return callback(err);
        }
        // Build a map from ID to user object.
        // (so userMap["4"] will give the user with ID 4)
        var userMap = {};
        users.forEach((user) => {
          userMap[user._id] = user;
        });
        callback(null, userMap);
      });
    }
  }
  /**
   * Resolves a feed item. Internal to the server, since it's synchronous.
   */
  function getFeedItem(feedItemId, callBack) {
    db.collection('feedItems').findOne({
      _id: feedItemId
    }, function(err, feedItem) {
      /* body... */
      if (err) {
        return callBack(err);
      } else if (feedItem === null) {
        return callBack(null, null);
      }
      var userList = [feedItem.contents.author];
      userList = userList.concat(feedItem.likeCounter);
      feedItem.comments.forEach((comment) => userList.push(comment.author));
      resolveUserObjects(userList, function(err, userMap) {
        if (err) {
          return callBack(err);
        }
        feedItem.contents.author = userMap[feedItem.contents.author];
        feedItem.likeCounter = feedItem.likeCounter.map((userId) => userMap[userId]);
        // Look up each comment's author's user object.
        feedItem.comments.forEach((comment) => {
          comment.author = userMap[comment.author];
        });
        // Return the resolved feedItem!
        callBack(null, feedItem);
      });
    }
    );

  }

  /**
 * Get the feed data for a particular user.
 * @param user The ObjectID of the user document.
 */
  function getFeedData(user, callback) {
    db.collection('users').findOne({
      _id: user
    }, function(err, userData) {
      if (err) {
        return callback(err);
      } else if (userData === null) {
        // User not found.
        return callback(null, null);
      }

      db.collection('feeds').findOne({
        _id: userData.feed
      }, function(err, feedData) {
        if (err) {
          return callback(err);
        } else if (feedData === null) {
          // Feed not found.
          return callback(null, null);
        }

        // We will place all of the resolved FeedItems here.
        // When done, we will put them into the Feed object
        // and send the Feed to the client.
        var resolvedContents = [];

        // processNextFeedItem is like an asynchronous for loop:
        // It performs processing on one feed item, and then triggers
        // processing the next item once the first one completes.
        // When all of the feed items are processed, it completes
        // a final action: Sending the response to the client.
        function processNextFeedItem(i) {
          // Asynchronously resolve a feed item.
          getFeedItem(feedData.contents[i], function(err, feedItem) {
            if (err) {
              // Pass an error to the callback.
              callback(err);
            } else {
              // Success!
              resolvedContents.push(feedItem);
              if (resolvedContents.length === feedData.contents.length) {
                // I am the final feed item; all others are resolved.
                // Pass the resolved feed document back to the callback.
                feedData.contents = resolvedContents;
                callback(null, feedData);
              } else {
                // Process the next feed item.
                processNextFeedItem(i + 1);
              }
            }
          });
        }

        // Special case: Feed is empty.
        if (feedData.contents.length === 0) {
          callback(null, feedData);
        } else {
          processNextFeedItem(0);
        }
      });
    });
  }

  /**
   * Get the user ID from a token. Returns -1 (an invalid ID) if it fails.
   */


  /**
   * Get the feed data for a particular user.
   */
  app.get('/user/:userid/feed', function(req, res) {
    var userid = req.params.userid;
    var fromUser = getUserIdFromToken(req.get('Authorization'));
    if (fromUser === userid) {
      // Send response.
      getFeedData(new ObjectID(userid), function(err, feedData) {
        if (err) {
          // A database error happened.
          // Internal Error: 500.
          res.status(500).send("Database error: " + err);
        } else if (feedData === null) {
          // Couldn't find the feed in the database.
          res.status(400).send("Could not look up feed for user " + userid);
        } else {
          // Send data.
          res.send(feedData);
        }
      });
    } else {
      // 403: Unauthorized request.
      res.status(403).end();
    }
  });

  /**
   * Adds a new status update to the database.
   */
  /**
 * Adds a new status update to the database.
 * @param user ObjectID of the user.
 */
  function postStatusUpdate(user, location, contents, image, callback) {
    // Get the current UNIX time.
    var time = new Date().getTime();
    // The new status update. The database will assign the ID for us.
    var newStatusUpdate = {
      "likeCounter": [],
      "type": "statusUpdate",
      "contents": {
        "author": user,
        "postDate": time,
        "location": location,
        "contents": contents,
        "image": image
      },
      // List of comments on the post
      "comments": []
    };

    // Add the status update to the database.
    db.collection('feedItems').insertOne(newStatusUpdate, function(err, result) {
      if (err) {
        return callback(err);
      }
      // Unlike the mock database, MongoDB does not return the newly added object
      // with the _id set.
      // Attach the new feed item's ID to the newStatusUpdate object. We will
      // return this object to the client when we are done.
      // (When performing an insert operation, result.insertedId contains the new
      // document's ID.)
      newStatusUpdate._id = result.insertedId;

      // Retrieve the author's user object.
      db.collection('users').findOne({
        _id: user
      }, function(err, userObject) {
        if (err) {
          return callback(err);
        }
        // Update the author's feed with the new status update's ID.
        db.collection('feeds').updateOne({
          _id: userObject.feed
        },
          {
            $push: {
              contents: {
                $each: [newStatusUpdate._id],
                $position: 0
              }
            }
          }, function(err) {
            if (err) {
              return callback(err);
            }
            // Return the new status update to the application.
            callback(null, newStatusUpdate);
          }
        );
      });
    });
  }

  //`POST /feeditem { userId: user, location: location, contents: contents  }`
  app.post('/feeditem', validate({
    body: StatusUpdateSchema
  }), function(req, res) {
    // If this function runs, `req.body` passed JSON validation!
    var body = req.body;
    var fromUser = getUserIdFromToken(req.get('Authorization'));

    // Check if requester is authorized to post this status update.
    // (The requester must be the author of the update.)
    if (fromUser === body.userId) {
      postStatusUpdate(new ObjectID(fromUser), body.location, body.contents, body.image, function(err, newUpdate) {
        if (err) {
          // A database error happened.
          // 500: Internal error.
          res.status(500).send("A database error occurred: " + err);
        } else {
          // When POST creates a new resource, we should tell the client about it
          // in the 'Location' header and use status code 201.
          res.status(201);
          res.set('Location', '/feeditem/' + newUpdate._id);
          // Send the update!
          res.send(newUpdate);
        }
      });
    } else {
      // 401: Unauthorized.
      res.status(401).end();
    }
  });
  function sendDatabaseError(res, err) {
    res.status(500).send("A database error occurred: " + err);
  }

  // `PUT /feeditem/feedItemId/likelist/userId` content
  app.put('/feeditem/:feeditemid/likelist/:userid', function(req, res) {
    var fromUser = getUserIdFromToken(req.get('Authorization'));
    var feedItemId = new ObjectID(req.params.feeditemid);
    var userId = req.params.userid;
    if (fromUser === userId) {
      // First, we can update the like counter.
      db.collection('feedItems').updateOne({
        _id: feedItemId
      },
        {
          // Add `userId` to the likeCounter if it is not already
          // in the array.
          $addToSet: {
            likeCounter: new ObjectID(userId)
          }
        }, function(err) {
          if (err) {
            return sendDatabaseError(res, err);
          }
          // Second, grab the feed item now that we have updated it.
          db.collection('feedItems').findOne({
            _id: feedItemId
          }, function(err, feedItem) {
            if (err) {
              return sendDatabaseError(res, err);
            }
            // Return a resolved version of the likeCounter
            resolveUserObjects(feedItem.likeCounter, function(err, userMap) {
              if (err) {
                return sendDatabaseError(res, err);
              }
              // Return a resolved version of the likeCounter
              res.send(feedItem.likeCounter.map((userId) => userMap[userId]));
            });
          }
          );
        });
    } else {
      // 401: Unauthorized.
      res.status(401).end();
    }
  });
  // Unlike a feed item.
  // Unlike a feed item.
app.delete('/feeditem/:feeditemid/likelist/:userid', function(req, res) {
  var fromUser = getUserIdFromToken(req.get('Authorization'));
  var feedItemId = new ObjectID(req.params.feeditemid);
  var userId = req.params.userid;
  if (fromUser === userId) {
    // Step 1: Remove userId from the likeCounter.
    db.collection('feedItems').updateOne({ _id: feedItemId },
      {
        // Only removes the userId from the likeCounter, if it is in the likeCounter.
        $pull: {
          likeCounter: new ObjectID(userId)
        }
      }, function(err) {
      if (err) {
        return sendDatabaseError(res, err);
      }
      // Step 2: Get the feed item.
      db.collection('feedItems').findOne({ _id: feedItemId }, function(err, feedItem) {
        if (err) {
          return sendDatabaseError(res, err);
        }
        // Step 3: Resolve the user IDs in the like counter into user objects.
        resolveUserObjects(feedItem.likeCounter, function(err, userMap) {
          if (err) {
            return sendDatabaseError(res, err);
          }
          // Return a resolved version of the likeCounter
          res.send(feedItem.likeCounter.map((userId) => userMap[userId]));
        });
      });
    });
  } else {
    // 401: Unauthorized.
    res.status(401).end();
  }
});

  // `PUT /feeditem/feedItemId/content newContent`
  // `PUT /feeditem/feedItemId/content newContent`
  app.put('/feeditem/:feeditemid/content', function(req, res) {
    var fromUser = new ObjectID(getUserIdFromToken(req.get('Authorization')));
    var feedItemId = new ObjectID(req.params.feeditemid);

    // Only update the feed item if the author matches the currently authenticated
    // user.
    db.collection('feedItems').updateOne({
      _id: feedItemId,
      // This is how you specify nested fields on the document.
      "contents.author": fromUser
    }, {
      $set: {
        "contents.contents": req.body
      }
    }, function(err, result) {
      if (err) {
        return sendDatabaseError(res, err);
      } else if (result.modifiedCount === 0) {
        // Could not find the specified feed item. Perhaps it does not exist, or
        // is not authored by the user.
        // 400: Bad request.
        return res.status(400).end();
      }

      // Update succeeded! Return the resolved feed item.
      getFeedItem(feedItemId, function(err, feedItem) {
        if (err) {
          return sendDatabaseError(res, err);
        }
        res.send(feedItem);
      });
    });
  });

  // `DELETE /feeditem/:id`
  // Unlike a feed item.
  app.delete('/feeditem/:feeditemid/likelist/:userid', function(req, res) {
    var fromUser = getUserIdFromToken(req.get('Authorization'));
    var feedItemId = new ObjectID(req.params.feeditemid);
    var userId = req.params.userid;
    if (fromUser === userId) {
      // Step 1: Remove userId from the likeCounter.
      db.collection('feedItems').updateOne({
        _id: feedItemId
      },
        {
          // Only removes the userId from the likeCounter, if it is in the likeCounter.
          $pull: {
            likeCounter: new ObjectID(userId)
          }
        }, function(err) {
          if (err) {
            return sendDatabaseError(res, err);
          }
          // Step 2: Get the feed item.
          db.collection('feedItems').findOne({
            _id: feedItemId
          }, function(err, feedItem) {
            if (err) {
              return sendDatabaseError(res, err);
            }
            // Step 3: Resolve the user IDs in the like counter into user objects.
            resolveUserObjects(feedItem.likeCounter, function(err, userMap) {
              if (err) {
                return sendDatabaseError(res, err);
              }
              // Return a resolved version of the likeCounter
              res.send(feedItem.likeCounter.map((userId) => userMap[userId]));
            });
          });
        });
    } else {
      // 401: Unauthorized.
      res.status(401).end();
    }
  });
  //`POST /search queryText`
  // `DELETE /feeditem/:id`
  app.delete('/feeditem/:feeditemid', function(req, res) {
    var fromUser = new ObjectID(getUserIdFromToken(req.get('Authorization')));
    var feedItemId = new ObjectID(req.params.feeditemid);

    // Check if authenticated user has access to delete the feed item.
    db.collection('feedItems').findOne({
      _id: feedItemId,
      "contents.author": fromUser
    }, function(err, feedItem) {
      if (err) {
        return sendDatabaseError(res, err);
      } else if (feedItem === null) {
        // Could not find the specified feed item. Perhaps it does not exist, or
        // is not authored by the user.
        // 400: Bad request.
        return res.status(400).end();
      }

      // User authored the feed item!
      // Remove feed item from all feeds using $pull and a blank filter.
      // A blank filter matches every document in the collection.
      db.collection('feeds').updateMany({}, {
        $pull: {
          contents: feedItemId
        }
      }, function(err) {
        if (err) {
          return sendDatabaseError(res, err);
        }

        // Finally, remove the feed item.
        db.collection('feedItems').deleteOne({
          _id: feedItemId
        }, function(err) {
          if (err) {
            return sendDatabaseError(res, err);
          }
          // Send a blank response to indicate success.
          res.send();
        });
      });
    });
  });

  // Post a comment
  app.post('/feeditem/:feeditemid/comments', validate({
    body: CommentSchema
  }), function(req, res) {
    var fromUser = getUserIdFromToken(req.get('Authorization'));
    var comment = req.body;
    var author = req.body.author;
    var feedItemId = req.params.feeditemid;
    if (fromUser === author) {
      var feedItem = readDocument('feedItems', feedItemId);
      // Initialize likeCounter to empty.
      comment.likeCounter = [];
      // Push returns the new length of the array.
      // The index of the new element is the length of the array minus 1.
      // Example: [].push(1) returns 1, but the index of the new element is 0.
      var index = feedItem.comments.push(comment) - 1;
      writeDocument('feedItems', feedItem);
      // 201: Created.
      res.status(201);
      res.set('Location', '/feeditem/' + feedItemId + "/comments/" + index);
      // Return a resolved version of the feed item.
      res.send(getFeedItemSync(feedItemId));
    } else {
      // Unauthorized.
      res.status(401).end();
    }
  });

  app.put('/feeditem/:feeditemid/comments/:commentindex/likelist/:userid', function(req, res) {
    var fromUser = getUserIdFromToken(req.get('Authorization'));
    var userId = parseInt(req.params.userid, 10);
    var feedItemId = parseInt(req.params.feeditemid, 10);
    var commentIdx = parseInt(req.params.commentindex, 10);
    // Only a user can mess with their own like.
    if (fromUser === userId) {
      var feedItem = readDocument('feedItems', feedItemId);
      var comment = feedItem.comments[commentIdx];
      // Only change the likeCounter if the user isn't in it.
      if (comment.likeCounter.indexOf(userId) === -1) {
        comment.likeCounter.push(userId);
      }
      writeDocument('feedItems', feedItem);
      comment.author = readDocument('users', comment.author);
      // Send back the updated comment.
      res.send(comment);
    } else {
      // Unauthorized.
      res.status(401).end();
    }
  });

  app.delete('/feeditem/:feeditemid/comments/:commentindex/likelist/:userid', function(req, res) {
    var fromUser = getUserIdFromToken(req.get('Authorization'));
    var userId = parseInt(req.params.userid, 10);
    var feedItemId = parseInt(req.params.feeditemid, 10);
    var commentIdx = parseInt(req.params.commentindex, 10);
    // Only a user can mess with their own like.
    if (fromUser === userId) {
      var feedItem = readDocument('feedItems', feedItemId);
      var comment = feedItem.comments[commentIdx];
      var userIndex = comment.likeCounter.indexOf(userId);
      if (userIndex !== -1) {
        comment.likeCounter.splice(userIndex, 1);
        writeDocument('feedItems', feedItem);
      }
      comment.author = readDocument('users', comment.author);
      res.send(comment);
    } else {
      // Unauthorized.
      res.status(401).end();
    }
  });

  // Reset database.
  // Reset the database.
  app.post('/resetdb', function(req, res) {
    console.log("Resetting database...");
    ResetDatabase(db, function() {
      res.send();
    });
  });

  /**
   * Translate JSON Schema Validation failures into error 400s.
   */
  app.use(function(err, req, res, next) {
    if (err.name === 'JsonSchemaValidation') {
      // Set a bad request http response status
      res.status(400).end();
    } else {
      // It's some other sort of error; pass it to next error middleware handler
      next(err);
    }
  });

  // Starts the server on port 3000!
  app.listen(3000, function() {
    console.log('Example app listening on port 3000!');
  });

})
