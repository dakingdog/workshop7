var MongoClient = require('mongodb').MongoClient;
var url = 'mongodb://localhost:27017/facebook';
MongoClient.connect(url, function (err, db) {
  if (err) {
    throw new Error("Could not connect to database: " + err);
  } else {
    console.log("connected correctly to server.")
    mongoExample(db);
  }
})
/**
	Description:
*Insert simple document into helloworld document collection. 
*@param db database collection
*@callback - callback function.
**/
function insertExample(db, callback) {
  var exampleDocument = {
    message: "Hello, World!"
  };
  db.collection('helloworld').insertOne(exampleDocument, function(err, result) {
    if (err) {
      throw err;
    } else {
      console.log("Successfully updated database, new object ID is " + result.insertedId);
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