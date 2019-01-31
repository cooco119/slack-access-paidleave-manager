import AccessManager from './src/access_manager';
import PaidleaveManager from './src/paidleave_manager';
const express = require('express');
const http = require('http');
const proxy = require('express-http-proxy');

(new AccessManager()).start(); // on port 3001
(new PaidleaveManager()).start(); // on port 3002

// start proxy
const port = 3000;
const app = express();
const access_manager_url = 'localhost:3001';
const paidleave_manager_url = 'localhost:3002';

app.use('/access', proxy(access_manager_url));
app.use('/paidleave', proxy(paidleave_manager_url));

http.createServer(app).listen(port, () => {
  console.log(`Slack API Proxy server listening on port ${port}`);
})