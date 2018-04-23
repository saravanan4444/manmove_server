var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
var Product = require('../models/product');
var Package = require('../models/package');
var userList = require('../models/userList');


var multer = require('multer');
var fs = require('fs');
// To get more info about 'multer'.. you can go through https://www.npmjs.com/package/multer..
var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, '/home/serans/Raj')
    },
    filename: function (req, file, cb) {
        cb(null, "img" + '-' + Date.now() + '.jpg');
    }
});

var upload = multer({
    storage: storage
});

router.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,PUT,PATCH,DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin,authorization, X-Requested-With, Content-Type, Accept');
    res.setHeader('Content-Type', 'application/json');
    req.on('error', (err) => {
        console.log(err.stack);
    })
    next();
});
router.get('/', function (req, res, next) {
    //   Product.find(function (err, products) {
    //     if (err) return next(err);
    //     res.json(products);
    //   });
    res.send("hi")
});
/* GET ALL PRODUCTS */
router.get('/alldata', function (req, res, next) {
    var query = req.query;
    Product.find(query, function (err, post) {
        if (err) return res.status(404).json({
            "status": 404,
            "data": err
        });
        res.status(200).json({
            "status": 200,
            "data": post
        });
    });
});

router.post('/testFormData', function (req, res) {
    console.log(req.query)
    var name = req.query.type
    var base64Data = req.body.data;
    var imgdata = base64Data.replace(/^data:image\/\w+;base64,/, '');
    var filename = name + '-' + Date.now() + '.jpg'
    fs.writeFile("/home/serans/Raj/" + filename, imgdata, { encoding: 'base64' }, function (err, data) {
        if (err) console.log(err);
        console.log(data)
        res.status(200).json({
            "status": 200,
            "type": name,
            "data": "103.82.211.18:3010/rest/api/latest/image/" + filename
        });
    });
});
/* GET SINGLE PRODUCT BY ID */
router.get('/data/:id', function (req, res, next) {
    Product.findById(req.params.id, function (err, post) {
        if (err) return res.status(404).json({
            "status": 404,
            "data": err
        });
        res.status(200).json({
            "status": 200,
            "data": post
        });
    });
});
// router.get('/alldata', function (req, res, next) {
//     Product.find(function (err, post) {
//         if (err) return res.status(404).json({
//             "status": 404,
//             "data": err
//         });
//         res.status(200).json({
//             "status": 200,
//             "data": post
//         });
//     });
// });

/* SAVE PRODUCT */
router.post('/data', function (req, res, next) {
    console.log(req.body)
    Product.create(req.body, function (err, post) {
        if (err) return res.status(404).json({
            "status": 404,
            "data": err
        }); res.status(200).json({
            "status": 200,
            "id": post.id,
            "updated date:": post.updated_at
        });
    });
});

/* UPDATE PRODUCT */
router.put('/data/:id', function (req, res, next) {
    Product.findByIdAndUpdate(req.params.id, req.body, function (err, post) {
        if (err) return res.status(404).json({
            "status": 404,
            "data": err
        });
        res.status(200).json({
            "status": 200,
            "id": post.id,
            "updated date": post.updated_at
        });
    });
});

/* DELETE PRODUCT */
router.delete('/data/:id', function (req, res, next) {
    Product.findByIdAndRemove(req.params.id, req.body, function (err, post) {
        if (err) return res.status(404).json({
            "status": 404,
            "data": err
        });
        res.status(200).json({
            "status": 200,
            "data": post
        });
    });
});

var imageSchema = mongoose.Schema({
    path: {
        type: String,
        required: true,
        trim: true
    },
    originalname: {
        type: String,
        required: true
    },
    name: { type: String },
});


var Image = module.exports = mongoose.model('files', imageSchema);




router.post('/upload', function (req, res, next) {
    console.log(req.body)
    var url = "103.82.211.18:3010/rest/api/latest/image/"
    if (upload.any().err) {
        return res.status(404).json({
            "status": 404,
            "data": res.err
        });
    }
    else {

        Product.create(req.body, function (err, post) {
            console.log(req.body)
            if (err) {
                console.log(err)
                return res.status(404).json({
                    "status": 404,
                    "data": err
                });
            }
            console.log("success")
            res.status(200).json({
                "status": 200,
                "id": post.id,
                "created date:": post.created_at
            });
        });
    }

});
router.get('/image/:pic', function (req, res, next) {
    console.log(req)
    fs.readFile('/home/serans/Raj/' + req.params.pic, function (err, content) {
        if (err) {
            res.writeHead(400, { 'Content-type': 'text/html' })
            console.log(err);
            res.end("No such image");
        } else {
            //specify the content type in the response will be an image
            res.writeHead(200, { 'Content-type': 'image/jpg' });
            res.end(content);
        }
    });
});
router.get('/availableid', function (req, res, next) {
    var query = req.query;
    Product.findOne().sort({ created_at: -1 }).exec(function (err, post) {
        if (err) return res.status(404).json({
            "status": 404,
            "data": err
        });
        console.log(post)
        if (post == null) {
            res.status(200).json({
                "status": 200,
                "availableid": 1
            });
        } else

            res.status(200).json({
                "status": 200,
                "availableid": post.appno + 1
            });
    });
});
router.get('/checkavail', function (req, res, next) {
    var query = req.query;
    console.log(query)
    Product.find(query, function (err, post) {
        if (err) return res.status(404).json({
            "status": 404,
            "data": err
        });
        console.log(post)
        var list = [];
        list = post;

        if (!Array.isArray(list) || !list.length) {
            res.status(200).json({
                "status": 200,
                "message": "available"
            });
        }
        else if (list[0].userName == query.userName)
            res.status(200).json({
                "status": 200,
                "message": "taken"
            });

    });
});
//////////////////////////////////////
router.get('/allpackage', function (req, res, next) {
    var query = req.query;
    Package.find(query, function (err, post) {
        if (err) return res.status(404).json({
            "status": 404,
            "data": err
        });
        res.status(200).json({
            "status": 200,
            "data": post
        });
    });
});


/* SAVE PRODUCT */
router.post('/package', function (req, res, next) {
    console.log(req.body)
    Package.create(req.body, function (err, post) {
        if (err) return res.status(404).json({
            "status": 404,
            "data": err
        }); res.status(200).json({
            "status": 200,
            "id": post.id,
            "updated date:": post.updated_at
        });
    });
});

/* UPDATE PRODUCT */
router.put('/package/:id', function (req, res, next) {
    Package.findByIdAndUpdate(req.params.id, req.body, function (err, post) {
        if (err) return res.status(404).json({
            "status": 404,
            "data": err
        });
        res.status(200).json({
            "status": 200,
            "id": post.id,
            "updated date": post.updated_at
        });
    });
});

/* DELETE PRODUCT */
router.delete('/package/:id', function (req, res, next) {
    Package.findByIdAndRemove(req.params.id, req.body, function (err, post) {
        if (err) return res.status(404).json({
            "status": 404,
            "data": err
        });
        res.status(200).json({
            "status": 200,
            "data": post
        });
    });
});
/* Get User */
router.get('/allUser', function (req, res, next) {
    var query = req.query;
    userList.find(query, function (err, post) {
        if (err) return res.status(404).json({
            "status": 404,
            "data": err
        });
        res.status(200).json({
            "status": 200,
            "data": post
        });
    });
});
/* UPDATE user */
router.put('/user/:id', function (req, res, next) {
    console.log(req.body)
    console.log(req.params.id)
    userList.findByIdAndUpdate(req.params.id, req.body, function (err, post) {
        if (err) return res.status(404).json({
            "status": 404,
            "data": err
        });
        res.status(200).json({
            "status": 200,
            "id": post.id,
            "updated date": post.updated_at
        });
    });
});
/* SAVE user */
router.post('/user', function (req, res, next) {
    console.log(req.body)
    userList.create(req.body, function (err, post) {
        if (err) return res.status(404).json({
            "status": 404,
            "data": err
        }); res.status(200).json({
            "status": 200,
            "id": post.id,
            "updated date:": post.updated_at
        });
    });
});
router.post('/login', function (req, res, next) {
    console.log(req.body)
    var email = req.body.email;
    var password = req.body.password
    var token
    require('crypto').randomBytes(48, function (err, buffer) {
        token = buffer.toString('hex');
console.log(token)
        userList.find({ 'email': email }, function (err, user) {
            // console.log(err);
            console.log(user)
            console.log(user.length)

            if (err)
                res.status(404).json({
                    "status": 500,
                    "message": err,
                });
            // if no user is found, return the message
            else if (user.length == 0)
                res.status(200).json({
                    "status": 500,
                    "message": "No user found",
                });

            // if the user is found but the password is wrong
            else if (password != user[0].password) {
                console.log(password);
                console.log(user);

                res.status(200).json({
                    "status": 404,
                    "message": "Oops! Wrong password",
                });
            }
            // all is well, return successful user
            else
                res.status(200).json({
                    "status": 200,
                    "token": token,
                    "message": "Successfully Logeed in",
                });
        });
    });

    // if (err) return res.status(404).json({
    //     "status": 404,
    //     "data": err
    // }); res.status(200).json({
    //     "status": 200,
    //     "id": user.id,
    //     "updated date:": user.updated_at
    // });
    // });
});

module.exports = router;