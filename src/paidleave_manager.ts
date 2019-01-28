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

export default class PaidleaveManager{
  token: string;
  rtm: RTMClient;
  web: WebClient;
  csvfilePrefix: string;
  // @ts-ignore Member 'slackInteractions' implicitly has an 'any' type.
  slackInteractions;
  // @ts-ignore
  menuSelections = {};

  constructor(){
    this.csvfilePrefix = process.cwd().toString() + '/../data/';
    const tokenfile = process.cwd().toString() + '/secure/slack_token';
    this.token = process.env.SLACK_TOKEN || fs.readFileSync(tokenfile).toString();
    this.rtm = new RTMClient(this.token);
    this.rtm.start();
    this.web = new WebClient(this.token);

    const signingFile = process.cwd().toString() + '/secure/slack_signing_secret';
    const signingSecret = fs.readFileSync(signingFile).toString();
    this.slackInteractions = createMessageAdapter(signingSecret);
  }

  private async getUserName(user: string){
    const queryString = require('query-string');
    const data = {
      'token': this.token,
      'user': user
    };
    const url = 'https://slack.com/api/users.info?' + queryString.stringify(data);
    return await axios.get(url,{
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    .then((response) => {
      if (response.status === 200){
        response = response.data;
        // @ts-ignore Property 'user' does not exist on type 'AxiosResponse<any>'.
        return response.user.real_name;
      }
    });
  }

  private readAccessChannel(): void {
    /* readAccessChannel : Reads access channel and parse to csv file.
     *
     * If the message is not in the form, search the keywords and if exists, 
     * get message info through web api and collect username. 
     * The rest of data - date & time, is given in the 'message' data.
     * 
     */
    this.web.channels.list()
    .then((res) => {

      // Find channel where bot is attending.
      // @ts-ignore Property 'channels' does not exist on type 'WebAPICallResult'.
      const access_channel = res.channels.find(c => c.is_member); 
      if (access_channel){
        // Subscribe 'message' event
        this.rtm.on('message', async message => {
            let name, year, month, day, hour, minute, second, type;
            let tmp, date, time;
            
            // Parse the message if has given format
            if (message.text.split(' : ').length === 2){
              [tmp, type] = message.text.split(' : ');
              [name, date, time] = tmp.split(' ');
              name = name.split('(')[0];
              [year, month, day] = date.split('.');
              [hour, minute, second] = time.split(':');
              console.log([name, year, month, day, hour, minute, second, type]);
            }

            // For message that is not in the given format, 
            // check if contains given keyword.
            else {
              console.log("다른 형식의 메세지(" + message.text +"). parse 시도.");
              
              // keyword == '퇴근' 
              if (message.text.indexOf('퇴근') !== -1){

                // From message, get user id
                // Using that as an argument(as a urlencoded) to Web API(GET method), 
                // We can get user info
                const user = message.user;
                name = await this.getUserName(user);

                // Set rest of params to save.
                // Get date & time from message.ts, which is a unix timestamp.
                type = '퇴근';
                const tmp_date = new Date(message.ts * 1000);
                year = tmp_date.getFullYear().toString();
                month = (tmp_date.getMonth() + 1).toString();
                day = tmp_date.getDate().toString();
                hour = tmp_date.getHours().toString();;
                minute = tmp_date.getMinutes().toString();;
                second = tmp_date.getSeconds().toString();;
                console.log([name, year, month, day, hour, minute, second, type]);
              }

              // keyword == '퇴근'
              // Rest of what's below is same as upper keyword block
              else if (message.text.indexOf('외출') !== -1){
                const user = message.user;
                name = await this.getUserName(user);
                type = '외출';
                const tmp_date = new Date(message.ts * 1000);
                year = tmp_date.getFullYear().toString();
                month = (tmp_date.getMonth() + 1).toString();
                day = tmp_date.getDate().toString();
                hour = tmp_date.getHours().toString();;
                minute = tmp_date.getMinutes().toString();;
                second = tmp_date.getSeconds().toString();;
                console.log([name, year, month, day, hour, minute, second, type]);
              }
            }

            // Write params into csv file.
            const csvfile = this.csvfilePrefix + name + '.csv';
            let sendHeaderOrNot: boolean = false;
            if (!fs.existsSync(csvfile)) sendHeaderOrNot = true;
            const writer = csvWriter({headers: ['name', 'year', 'month', 'day', 'hour', 'minute', 'second', 'type'], sendHeaders: sendHeaderOrNot});
            writer.pipe(fs.createWriteStream(csvfile, { flags: 'a+' }));
            writer.write([name, year, month, day, hour, minute, second, type]);
            writer.end();
        });
      }
    });
  }

  private handleSlashCommand(req: Request, res: Response){
    const responseUrl = req.body.response_url;
    const data = {
        "response_type": "ephemeral",
        "text": "[내 출퇴근 기록 조회하기]",
        "attachments": [
            {
                "text": "조회 범위 선택",
                "fallback": "에러 발생, 다시 시도해주세요.",
                "callback_id": "select_scope",
                "color": "#3AA3E3",
                "attachment_type": "default",
                "actions": [
                    {
                        "name": "daily",
                        "text": "일별",
                        "type": "button",
                        "value": "daily"
                    },
                    {
                        "name": "weekly",
                        "text": "주별",
                        "type": "button",
                        "value": "weekly"
                    },
                    {
                        "name": "monthly",
                        "text": "월별",
                        "type": "button",
                        "value": "monthly"
                    }
                ]
            }
        ]
    }
    res.status(200).json(data);
  }

  public start(){

    // Read access channel and save to csv
    this.readAccessChannel();

    // Start interactive ui service
    const port = 3000;
    const app = express();

    app.use('/slack/paidleave/actions', this.slackInteractions.expressMiddleware());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());

    app.post('/slack/paidleave/slash', this.handleSlashCommand);

    http.createServer(app).listen(port, () => {
      console.log(`server listening on port ${port}`);
    })
  }
}