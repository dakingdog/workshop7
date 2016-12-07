var MongoClient = require('mongodb').MongoClient;
var url = 'mongodb://localhost:27017/facebook';
MongoClient.connect(url, function (err, db) {
  if (err) {
    throw new Error("Could not connect to database: " + err);
  } else {
    console.log("connected correctly to server.");
    mongoExample(db);
  }
})
/**
 * Inserts a simple document into the 'helloworld'
 * document collection.
 * @param db The database connection
 * @param callback A callback function to call once the
 *   operation completes. We will pass back the new object's
 *   ID.
 */
function insertExample(db, callback) {
  // A document is just a JSON object, like in our mock database.
  var exampleDocument = {
    message: "Hello, world!"
  };
  // Insert the example document into collection 'helloworld'.
  db.collection('helloworld').insertOne(exampleDocument, function(err, result) {
    if (err) {
      // Something bad happened, and the insertion failed.
      throw err;
    } else {
      // Success!
      console.log("Successfully updated database! The new object's ID is " + result.insertedId);
      callback(result.insertedId);
    }
  });
}

/**
 * Get a document from the helloworld document collection with
 * a particular _id.
 * @param db The database connection.
 * @param id The _id of the object to retrieve.
 * @param callback A callback function to run when the operation completes.
 *   It is called with the requested object.
 */
function getHelloWorldDocument(db, id, callback) {
  // Our database query: Find an object with this _id.
  var query = {
    "_id": id
  };
  // findOne returns the first object that matches the query.
  // Since _id must be unique, there will only be one object that
  // matches.
  db.collection('helloworld').findOne(query, function(err, doc) {
    if (err) {
      // Something bad happened.
      throw err;
    } else {
      // Success! If we found the document, then doc contains
      // the document. If we did not find the document, doc is
      // null.
      callback(doc);
    }
  });
}

function mongoExample(db) {
  insertExample(db, function(newId) {
    getHelloWorldDocument(db, newId, function(doc) {
      console.log("Wrote new object to helloworld collection");
      console.log(doc);
    })
  })
}