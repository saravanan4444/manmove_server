var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
var Product = require('../models/product');
var Package = require('../models/package');
var userList = require('../models/userList');
var adminuser = require('../models/adminuser');


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
            var name;
            if (req.body.gender == "f") {
                name = "Ms. " + req.body.firstName
            } else {
                name = "Mr. " + req.body.firstName

            }
            console.log("success")
            res.status(200).json({
                "status": 200,
                "id": post.id,
                "created date:": post.created_at
            });
            var request = require('request');
            var message = "Dear " + name + " Welcome to Serans. Your Application is under process. Will revert within 24 hours"
            request('http://bulksms.mysmsmantra.com:8080/WebSMS/SMSAPI.jsp?username=serans&password=1312733985&sendername=SERANS&mobileno=91' + req.body.mobile + '&message=' + message, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log(body) // Print the google web page.
                }
            })

            var emailMessage = '<div class="pre"><span style="white-space:nowrap">Dear&nbsp;' + name + ',</span><br>' +
                '&nbsp;&nbsp;&nbsp;&nbsp;Welcome to the Serans Portal. We thank you for choosing us as your preferred Internet service provider,Your Application has been Registered Successfully.<br>' +
                'Please remember the information in the application will need to access your account for requesting and managing your account and has to produce copies of the documents for the internet connection.<br>' +
                '(a) Proof of address (Any one of the following): Applicant’s ration card, certificate from Employer of reputed companies on letter head, water /telephone /electricity bill/statement of running bank account/Income Tax Assessment Order /Election Commission ID card. (NOTE: If any applicant submits only ration card as proof of address, it should be accompanied by one more proof of address out of the above categories).<br>' +
                '(b) ID Proof (Any one of the following): Voter Id, Pan Card or Aadhar Card.<br>' +
                '<span style="white-space:nowrap">(C)&nbsp;Passport&nbsp;size&nbsp;–&nbsp;2&nbsp;Photo.</span><br>' +
                '<span style="white-space:nowrap">Our&nbsp;customer&nbsp;care&nbsp;executive&nbsp;will&nbsp;contact&nbsp;you&nbsp;soon.</span><br>' +
                'We look forward to supporting you through as a Best Internet Service Provider.<br>' +
                '<span style="white-space:nowrap">Warm&nbsp;regards,</span><br>' +
                '<span style="white-space:nowrap">Customer&nbsp;Care&nbsp;Service,</span><br>' +
                '<span style="white-space:nowrap">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Serans.</span><br>' +
                '<span style="white-space:nowrap">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a rel="noreferrer" target="_blank" href="http://www.serans.co.in">www.serans.co.in</a></span><br>' +
                '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Note: We wish to inform you that Requested Connection may be according to Subject to availability in your Area.<br>' +
                '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;……..This is an auto generated mail; please do not reply to this mail………………..<br>' +
                '</div>';

            'use strict';
            const nodemailer = require('nodemailer');

            // Generate test SMTP service account from ethereal.email
            // Only needed if you don't have a real mail account for testing
            nodemailer.createTestAccount((err, account) => {
                // create reusable transporter object using the default SMTP transport
                let transporter = nodemailer.createTransport({
                    host: 'md-in-64.webhostbox.net',
                    port: 465,
                    secure: true, // true for 465, false for other ports
                    auth: {
                        user: 'noreply@serans.co.in', // generated ethereal user
                        pass: 'serans@12345' // generated ethereal password
                    }
                });

                // setup email data with unicode symbols
                let mailOptions = {
                    from: '"Serans" <noreply@serans.co.in>', // sender address
                    to: req.body.email, // list of receivers
                    subject: 'Greetings ✔', // Subject line
                    text: emailMessage, // plain text body
                    html: emailMessage // html body
                };

                // send mail with defined transport object
                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        return console.log(error);
                    }
                    console.log('Message sent: %s', info.messageId);
                    // Preview only available when sending through an Ethereal account
                    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));

                    // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>
                    // Preview URL: https://ethereal.email/message/WaQKMgKddxQDoou...
                });
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
            "status": 404,            // var email = require('emailjs');

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

router.post('/forget', function (req, res, next) {
    console.log(req.body)
    var email = req.body.email;
    var token

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
        // all is well, return successful user
        else {
            var emailMessage = 'Your requested password for the email address ' + req.body.email + ' password is <div style="color:red">' + user[0].password + '</div>';
            // var email = require('emailjs');
            // var server = email.server.connect({
            //     user: 'noreply@serans.co.in',
            //     password: 'serans@12345',
            //     host: 'md-in-64.webhostbox.net ',
            //     port: 465,
            //     ssl: true,
            // });

            // server.send({
            //     text: emailMessage,
            //     from: 'Serans <noreply@serans.co.in>',
            //     to: req.body.email,
            //     subject: 'Greetings',
            //     attachment:
            //         [
            //             { data: emailMessage, alternative: true },
            //         ]
            // }, function (err, message) {
            //     console.log(err || message);
            //     if (err) return res.status(404).json({
            //         "status": 404,
            //         "data": err
            //     });
            //     res.status(200).json({
            //         "status": 200,
            //         "token": token,
            //         "message": "Successfully found in",
            //     });
            // });
            'use strict';
            const nodemailer = require('nodemailer');

            // Generate test SMTP service account from ethereal.email
            // Only needed if you don't have a real mail account for testing
            nodemailer.createTestAccount((err, account) => {
                // create reusable transporter object using the default SMTP transport
                let transporter = nodemailer.createTransport({
                    host: 'md-in-64.webhostbox.net',
                    port: 465,
                    secure: true, // true for 465, false for other ports
                    auth: {
                        user: 'noreply@serans.co.in', // generated ethereal user
                        pass: 'serans@12345' // generated ethereal password
                    }
                });

                // setup email data with unicode symbols
                let mailOptions = {
                    from: '"Serans" <noreply@serans.co.in>', // sender address
                    to: req.body.email, // list of receivers
                    subject: 'Greetings ✔', // Subject line
                    text: emailMessage, // plain text body
                    html: emailMessage // html body
                };

                // send mail with defined transport object
                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        return console.log(error);
                    }
                    res.status(200).json({
                        "status": 200,
                        "token": token,
                        "message": "Successfully found in",
                    });
                    console.log('Message sent: %s', info.messageId);
                    // Preview only available when sending through an Ethereal account
                    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));

                    // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>
                    // Preview URL: https://ethereal.email/message/WaQKMgKddxQDoou...
                });
            });
        }

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

router.post('/email', function (req, res, next) {
    // var email = require('emailjs');
    // var emailMessage = 'hi';
    // var server = email.server.connect({
    //     user: 'ponnarasan@serans.co.in',
    //     password: 'serans@12345',
    //     host: 'md-in-64.webhostbox.net ',
    //     port: 465,
    //     ssl: true,
    // });

    // server.send({
    //     text: emailMessage,
    //     from: 'Serans <ponnarasan@serans.co.in>',
    //     to: 'ponnarasan@serans.co.in',
    //     cc: 'seransisp@gmail.com',
    //     subject: 'Greetings',
    //     attachment:
    //         [
    //             { data: emailMessage, alternative: true },
    //         ]
    // }, function (err, message) {
    //     console.log(err || message);
    //     if (err) return res.status(404).json({
    //         "status": 404,
    //         "data": err
    //     });
    //     res.status(200).json({
    //         "status": 200,

    //     });

    // });
    'use strict';
    const nodemailer = require('nodemailer');

    // Generate test SMTP service account from ethereal.email
    // Only needed if you don't have a real mail account for testing
    nodemailer.createTestAccount((err, account) => {
        // create reusable transporter object using the default SMTP transport
        let transporter = nodemailer.createTransport({
            host: 'md-in-64.webhostbox.net',
            port: 465,
            secure: true, // true for 465, false for other ports
            auth: {
                user: 'ponnarasan@serans.co.in', // generated ethereal user
                pass: 'serans@12345' // generated ethereal password
            }
        });

        // setup email data with unicode symbols
        let mailOptions = {
            from: '"Ponnu 👻" <fponnarasan@serans.co.in>', // sender address
            to: 'seransisp@gmail.com', // list of receivers
            subject: 'Hello ✔', // Subject line
            text: 'Hello world?', // plain text body
            html: '<b>Hello world?</b>' // html body
        };

        // send mail with defined transport object
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return console.log(error);
            }
            console.log('Message sent: %s', info.messageId);
            // Preview only available when sending through an Ethereal account
            console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));

            // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>
            // Preview URL: https://ethereal.email/message/WaQKMgKddxQDoou...
        });
    });

});

/* GET ALL ADmin USER */
router.get('/alladminuser', function (req, res, next) {
    var query = req.query;
    adminuser.find(query, function (err, post) {
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
router.post('/adminuser', function (req, res, next) {
    console.log(req.body)
    adminuser.create(req.body, function (err, post) {
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
router.put('/adminuser/:id', function (req, res, next) {
    adminuser.findByIdAndUpdate(req.params.id, req.body, function (err, post) {
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
router.post('/adminlogin', function (req, res, next) {
    console.log(req.body)
    var email = req.body.email;
    var password = req.body.password
    var token
    require('crypto').randomBytes(48, function (err, buffer) {
        token = buffer.toString('hex');
        console.log(token)
        adminuser.find({ 'email': email }, function (err, user) {
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
                    "data": user,
                    "message": "Successfully Logeed in",
                });
        });
    });
});

module.exports = router;