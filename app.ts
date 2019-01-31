import AccessManager from './src/access_manager';
import PaidleaveManager from './src/paidleave_manager';
const express = require('express');
const http = require('http');
const proxy = require('express-http-proxy');

(new AccessManager()).start(); // on port 3001
(new PaidleaveManager()).start(); // on port 3002
