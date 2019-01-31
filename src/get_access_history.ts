import * as fs from 'fs';
import axios from 'axios';
import { RTMClient, WebClient } from '@slack/client';
import { Request } from 'express-serve-static-core';
import { Response } from 'express';
const { createMessageAdapter } = require('@slack/interactive-messages');
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const csvWriter = require('csv-write-stream');
const Papa = require('papaparse');

const csvfilePrefix = process.cwd().toString() + '/../data/access/';
const tokenfile = process.cwd().toString() + '/secure/access/slack_token';
const token = process.env.SLACK_TOKEN || fs.readFileSync(tokenfile).toString();
const web = new WebClient(token);
const queryString = require('query-string');

let channel;
web.conversations.list()
  .then((res) => {

    // Find channel where bot is attending.
    // @ts-ignore Property 'channels' does not exist on type 'WebAPICallResult'.
    // console.log(res);
    // @ts-ignore
    // channel = res.conversations.find(c => c.is_member); 
    channel = 'CFMKGCX3L'
    if (!channel){
      console.log('No channel');
      return;
    }
    const oldest = new Date(2018, 0, 1);
    console.log('oldest: ', oldest);
    
    const data = {
      'token': token,
      'channel': channel,
      'limit': 20,
      'inclusive': true,
      'oldest': oldest
    };
    
    // @ts-ignore
    web.conversations.history(data)
    // @ts-ignore
    .then( res => {
      console.log(res);
    })
    // @ts-ignore
    .catch( e => {
      console.log(e);
    })
});



// const url = 'https://slack.com/api/channels.history?' + queryString.stringify(data);
// axios.get(url,{
//   headers: {
//     'Content-Type': 'application/x-www-form-urlencoded'
//   }
// })
// .then((response) => {
//   if (response.status === 200){
//     response = response.data;
//     // @ts-ignore Property 'user' does not exist on type 'AxiosResponse<any>'.
//     console.log(response);
//   }
// });