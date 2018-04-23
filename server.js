
var express = require("express")
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var db= require("./config/db")
var rest = require('./config/restHandler');

var app = express()
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
    app.use('/rest/api/latest', rest);
app.listen("3010",()=>{
    console.log("I just started listening at 3010!.")
})
