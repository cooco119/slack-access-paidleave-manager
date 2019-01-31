/* 
 * slack-access-paidleav-manager: access_manager.ts
 *
 * 
 * Saves messages from slack channel where the bot is in,
 * and offers an interactive ui api backend which offers users to 
 * search his/her own access history.
 *
 * 1. Prerequisites 
 * (Reference to https://api.slack.com)
 * 
 * - Slack app : https://api.slack.com/slack-apps
 * 
 * - Add a bot
 * 
 * - Required scopes : channels:history,
 *                     channels:read,
 *                     chat:write:bot,
 *                     users:read
 * ---> For information about scopes: https://api.slack.com/scopes
 * 
 * - OAuth token for bot : Starts with 'xoxb-...'
 * 
 * 2. Make copy slack token to a file secure/slack_token
 * 
 * 3. To start, 'yarn start' at project root directory. (Uses ts-node)
 * 
 */
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


export default class AccessManager{
  token: string;
  rtm: RTMClient;
  web: WebClient;
  csvfilePrefix: string;
  // @ts-ignore Member 'slackInteractions' implicitly has an 'any' type.
  slackInteractions;
  // @ts-ignore
  menuSelections = {};

  constructor(){
    this.csvfilePrefix = process.cwd().toString() + '/../data/access/';
    const tokenfile = process.cwd().toString() + '/secure/access/slack_token';
    this.token = process.env.SLACK_TOKEN || fs.readFileSync(tokenfile).toString();
    this.rtm = new RTMClient(this.token);
    this.rtm.start();
    this.web = new WebClient(this.token);

    const signingFile = process.cwd().toString() + '/secure/access/slack_signing_secret';
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
        // @ts-ignore Property 'user' does not exist on type 'AxiosResponse<any>'.
        return response.user.profile.display_name;
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

  private handleScope(value: string){
    let templatefile: string;
    let data;

    if (value === 'daily'){
      templatefile = process.cwd() + '/src/ui_messages/daily_select_template.json';
      data = JSON.parse(fs.readFileSync(templatefile).toString());
      const currentYear = (new Date()).getFullYear();
      let yearOptions = [];
      for (let i: number= 2015; i <= currentYear; i++){
        let yearOption = {
          "text": i.toString() + '년',
          "value": i.toString()
        }
        yearOptions.push(yearOption);
      }
      data.attachments[0].actions[0].options = yearOptions;
    }

    if (value === 'monthly'){
      templatefile = process.cwd() + '/src/ui_messages/monthly_select_template.json';
      data = JSON.parse(fs.readFileSync(templatefile).toString());
      const currentYear = (new Date()).getFullYear();
      let yearOptions = [];
      for (let i: number= 2015; i <= currentYear; i++){
        let yearOption = {
          "text": i.toString() + '년',
          "value": i.toString()
        }
        yearOptions.push(yearOption);
      }
      data.attachments[0].actions[0].options = yearOptions;
    }

    if (value === 'weekly'){
      templatefile = process.cwd() + '/src/ui_messages/weekly_select_template.json';
      data = JSON.parse(fs.readFileSync(templatefile).toString());
      const currentYear = (new Date()).getFullYear();
      let yearOptions = [];
      for (let i: number= 2015; i <= currentYear; i++){
        let yearOption = {
          "text": i.toString() + '년',
          "value": i.toString()
        }
        yearOptions.push(yearOption);
      }
      data.attachments[0].actions[0].options = yearOptions;
    }
    
    return data;
  }

  // Entrypoint
  public start(){

    // Read access channel and save to csv
    this.readAccessChannel();

    // Start interactive ui service
    const port = 3001;
    const app = express();

    app.use('/actions', this.slackInteractions.expressMiddleware());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());

    app.post('/slash', this.handleSlashCommand);


    // Add handler to ui actions 
    // @ts-ignore
    this.slackInteractions.action({ callbackId: 'select_scope', type: 'button' }, async (payload, respond) => {
      const user = payload.user.id;
      const name = await this.getUserName(user);

      const value = payload.actions[0].value;
      const data = this.handleScope(value);
      if (value === 'daily'){
        // @ts-ignore
        this.menuSelections[name] = {
          'year': null,
          'month': null,
          'day': null
        }
      }
      if (value === 'monthly'){
        // @ts-ignore
        this.menuSelections[name] = {
          'year': null,
          'month': null
        }
      }
      if (value === 'weekly'){
        // @ts-ignore
        this.menuSelections[name] = {
          'year': null,
          'month': null,
          'week': null,
        }
      }
      // console.log(data);
      respond(data);

      return;
    });

    // @ts-ignore
    this.slackInteractions.action({ callbackId: 'select_daily', type: 'select' }, async (payload, respond) => {
      const user = payload.user.id;
      const name = await this.getUserName(user);
      const key = payload.actions[0].name;
      const value = payload.actions[0].selected_options[0].value;
      // @ts-ignore
      if (key === 'year') this.menuSelections[name].year = value;
      // @ts-ignore
      if (key === 'month') this.menuSelections[name].month = value;
      // @ts-ignore
      if (key === 'day') this.menuSelections[name].day = value;
      console.log('Added to option field');
      try{
        // @ts-ignore
        // respond().catch(err => console.log(err));
      }
      catch(e) { console.log(e); }
      return;
    });

    // @ts-ignore
    this.slackInteractions.action({ callbackId: 'select_weekly', type: 'select' }, async (payload, respond) => {
      const user = payload.user.id;
      const name = await this.getUserName(user);
      const key = payload.actions[0].name;
      const value = payload.actions[0].selected_options[0].value;
      // @ts-ignore
      if (key === 'year') this.menuSelections[name].year = value;
      // @ts-ignore
      if (key === 'month') this.menuSelections[name].month = value;
      // @ts-ignore
      if (key === 'week') this.menuSelections[name].week = value;
      console.log('Added to option field');
      try{
        // @ts-ignore
        // respond().catch(err => console.log(err));
      }
      catch(e) { console.log(e); }
      return;
    });

    // @ts-ignore
    this.slackInteractions.action({ callbackId: 'select_monthly', type: 'select' }, async (payload, respond) => {
      const user = payload.user.id;
      const name = await this.getUserName(user);
      const key = payload.actions[0].name;
      const value = payload.actions[0].selected_options[0].value;
      // @ts-ignore
      if (key === 'year') this.menuSelections[name].year = value;
      // @ts-ignore
      if (key === 'month') this.menuSelections[name].month = value;
      console.log('Added to option field');
      try{
        // @ts-ignore
        // respond().catch(err => console.log(err));
      }
      catch(e) { console.log(e); }
      return;
    });

    // @ts-ignore
    this.slackInteractions.action({ callbackId: 'select_daily', type: 'button' }, async (payload, respond) => {
      console.log('select_daily');

      const user = payload.user.id;
      const name = await this.getUserName(user);
      // @ts-ignore
      const targetyear = this.menuSelections[name].year;
      // @ts-ignore
      const targetmonth = this.menuSelections[name].month;
      // @ts-ignore
      const targetday = this.menuSelections[name].day;

      const targetfile = this.csvfilePrefix + name + '.csv';
      if (!fs.existsSync(targetfile)){
        const data = {
          "response_type": "ephemeral",
          "text": "해당 ID에 대한 기록 존재하지 않음"
        };
        respond(data);
        return;
      }
      let csvdata: Array<Object> = [];
      await Papa.parse(fs.readFileSync(targetfile).toString(), {
        worker: true,
        // @ts-ignore
        step: (results) => {
          csvdata.push(results.data[0]);
        }
      })
      // console.log(csvdata);
      let resultData: Array<string> = [];
      let attend = 0, goHome = 0, getIn_normal = 0, getIn_return = 0, goOut = 0;
      csvdata.forEach(element => {
        // @ts-ignore
        if ((element[1] === targetyear || element[1] === '0'+targetyear) && ((element[2] === targetmonth) || (element[2] === '0'+targetmonth)) && ((element[3] === targetday) || (element[3] === '0'+targetday))){
          // @ts-ignore
          resultData.push(element);
        }
      });
      let resultListString = '';
      let attendTime: Date = null, goHomeTime: Date = null;
      try {resultData.forEach(element => {
        switch (element[7]){
          case '출근':
            attend += 1;
            attendTime = new Date(parseInt(element[1]),
                                  parseInt(element[2]) - 1,
                                  parseInt(element[3]),
                                  parseInt(element[4]),
                                  parseInt(element[5]),
                                  parseInt(element[6]));
            break;
          case '출입':
            getIn_normal += 1;
            break;
          case '퇴근':
            goHome += 1;
            goHomeTime = new Date(parseInt(element[1]),
                                  parseInt(element[2]) - 1,
                                  parseInt(element[3]),
                                  parseInt(element[4]),
                                  parseInt(element[5]),
                                  parseInt(element[6]));
            break;
          case '외출':
            goOut += 1;
            break;
          case '복귀':
            getIn_return += 1;
            break;
          default:
            console.log("No such type");
        }
          resultListString += `${element[1]}년 ${element[2]}월 ${element[3]}일 ${element[4]}시 ${element[5]}분 ${element[6]}초 : ${element[7]}\n`
        });
        let workDuration: number;
        let workDurationStr: string = '';
        let expectedGoHome: Date;
        let remaining: string = '';
        if (goHome !== 0){
          // @ts-ignore
          workDuration = ((goHomeTime.getTime() - attendTime.getTime())/1000);
        }
        else if (attendTime.getDate() === new Date().getDate()){
          if (attendTime.getHours() < 12){
            expectedGoHome = (new Date(attendTime.getTime() + 9*60000));
          }
          else {
            expectedGoHome = (new Date(attendTime.getTime() + 9*60000));
            remaining = '퇴근까지 얼마나?: ' + (new Date(expectedGoHome.getTime() - attendTime.getTime())).toLocaleTimeString();
          }
        }
        if (workDuration !== 0){
          const underHour = (Math.floor((workDuration % 3600) / 360) / 10);
          workDurationStr = (Math.floor(workDuration / 3600)).toString() + (underHour === 0 ? '' : '.' + underHour.toString().split('.')[1]) + '시간';
        }

        const respondText = `총 근무: ${workDurationStr}, 출근: ${attendTime.toLocaleTimeString()}, ${goHome === 0 ? remaining : '퇴근: ' + goHomeTime.toLocaleTimeString()}\n\n` + resultListString;

        const data = {
          "response_type": "ephemeral",
          "text": "일별 조회 결과 - " + attendTime.toDateString(),
          "attachments": [
            {
              "text": respondText
            }
          ]
        };
        respond(data);
      }
      catch(e) {
        console.log(e);
      }
    });

    // @ts-ignore
    this.slackInteractions.action({ callbackId: 'select_weekly', type: 'button' }, async (payload, respond) => {
      console.log('select_weekly');

      const user = payload.user.id;
      const name = await this.getUserName(user);
      // @ts-ignore
      const targetyear = this.menuSelections[name].year;
      // @ts-ignore
      const targetmonth = this.menuSelections[name].month;
      // @ts-ignore
      const targetweek = this.menuSelections[name].week;

      const targetfile = this.csvfilePrefix + name + '.csv';
      if (!fs.existsSync(targetfile)){
        const data = {
          "response_type": "ephemeral",
          "text": "해당 ID에 대한 기록 존재하지 않음"
        };
        respond(data);
        return;
      }
      let csvdata: Array<Object> = [];
      await Papa.parse(fs.readFileSync(targetfile).toString(), {
        worker: true,
        // @ts-ignore
        step: (results) => {
          csvdata.push(results.data[0]);
        }
      })

      let resultData: Array<string> = [];
      let attend = 0, goHome = 0, getIn_normal = 0, getIn_return = 0, goOut = 0;
      csvdata.forEach(element => {
        // @ts-ignore
        if ((element[1] === targetyear || element[1] === '0'+targetyear) &&((element[2] === targetmonth) || (element[2] === '0'+targetmonth))){

          // calculate if the date is in target week
          // @ts-ignore 
          const firstDay = new Date(element[1], parseInt(element[2]) - 1 , 1).getDay();
          // @ts-ignore 
          const date = new Date(element[1], parseInt(element[2]) - 1, element[3]);
          const week = Math.ceil((date.getDate() + firstDay) / 7);
          
          if (week.toString() === targetweek){
            // @ts-ignore
            resultData.push(element);
          }
        }
      });
      let resultListString = '';
      let attendTime: Date = null, goHomeTime: Date = null;
      let workDuration: number = 0;
      try {
        resultData.forEach(element => {
          switch (element[7]){
            case '출근':
              attend += 1;
              attendTime = new Date(parseInt(element[1]),
                                    parseInt(element[2]) - 1,
                                    parseInt(element[3]),
                                    parseInt(element[4]),
                                    parseInt(element[5]),
                                    parseInt(element[6]));
              break;
            case '출입':
              getIn_normal += 1;
              break;
            case '퇴근':
              goHome += 1;
              goHomeTime = new Date(parseInt(element[1]),
                                    parseInt(element[2]) - 1,
                                    parseInt(element[3]),
                                    parseInt(element[4]),
                                    parseInt(element[5]),
                                    parseInt(element[6]));
              break;
            case '외출':
              goOut += 1;
              break;
            case '복귀':
              getIn_return += 1;
              break;
            default:
              console.log("No such type");
          }
          if (goHomeTime && attendTime){
            if (goHomeTime.getDate() === attendTime.getDate()){
              // @ts-ignore
              workDuration += ((goHomeTime.getTime() - attendTime.getTime())/1000);
            }
          }
            resultListString += `${element[1]}년 ${element[2]}월 ${element[3]}일 ${element[4]}시 ${element[5]}분 ${element[6]}초 : ${element[7]}\n`;
        });
        let workDurationStr: string = '';
        if (workDuration !== 0){
          const underHour = (Math.floor((workDuration % 3600) / 360) / 10);
          workDurationStr = (Math.floor(workDuration / 3600)).toString() + (underHour === 0 ? '' : '.' + underHour.toString().split('.')[1]) + '시간';
        }
        const respondText = `총 근무: ${workDurationStr}\n\n` + resultListString;

        const data = {
          "response_type": "ephemeral",
          "text": "주별 조회 결과 - " + targetyear + '년 ' + targetmonth + '월 ' + targetweek + '주',
          "attachments": [
            {
              "text": respondText
            }
          ]
        };
        respond(data);
      }
      catch(e) {
        console.log(e);
      }
    });

    // @ts-ignore
    this.slackInteractions.action({ callbackId: 'select_monthly', type: 'button' }, async (payload, respond) => {
      console.log('select_monthly');

      const user = payload.user.id;
      const name = await this.getUserName(user);
      // @ts-ignore
      const targetyear = this.menuSelections[name].year;
      // @ts-ignore
      const targetmonth = this.menuSelections[name].month;

      const targetfile = this.csvfilePrefix + name + '.csv';
      if (!fs.existsSync(targetfile)){
        const data = {
          "response_type": "ephemeral",
          "text": "해당 ID에 대한 기록 존재하지 않음"
        };
        respond(data);
        return;
      }
      let csvdata: Array<Object> = [];
      await Papa.parse(fs.readFileSync(targetfile).toString(), {
        worker: true,
        // @ts-ignore
        step: (results) => {
          csvdata.push(results.data[0]);
        }
      })
      // console.log(csvdata);
      let resultData: Array<string> = [];
      let attend = 0, goHome = 0, getIn_normal = 0, getIn_return = 0, goOut = 0;
      csvdata.forEach(element => {
        // @ts-ignore
        if ((element[1] === targetyear || element[1] === '0'+targetyear) &&((element[2] === targetmonth) || (element[2] === '0'+targetmonth))){
          // @ts-ignore
          resultData.push(element);
        }
      });
      let resultListString = '';
      let attendTime: Date = null, goHomeTime: Date = null;
      let workDuration: number = 0;
      try {
        resultData.forEach(element => {
          switch (element[7]){
            case '출근':
              attend += 1;
              attendTime = new Date(parseInt(element[1]),
                                    parseInt(element[2]) - 1,
                                    parseInt(element[3]),
                                    parseInt(element[4]),
                                    parseInt(element[5]),
                                    parseInt(element[6]));
              break;
            case '출입':
              getIn_normal += 1;
              break;
            case '퇴근':
              goHome += 1;
              goHomeTime = new Date(parseInt(element[1]),
                                    parseInt(element[2]) - 1,
                                    parseInt(element[3]),
                                    parseInt(element[4]),
                                    parseInt(element[5]),
                                    parseInt(element[6]));
              break;
            case '외출':
              goOut += 1;
              break;
            case '복귀':
              getIn_return += 1;
              break;
            default:
              console.log("No such type");
          }
          if (goHomeTime && attendTime){
            if (goHomeTime.getDate() === attendTime.getDate()){
              // @ts-ignore
              workDuration += ((goHomeTime.getTime() - attendTime.getTime())/1000);
            }
          }
          resultListString += `${element[1]}년 ${element[2]}월 ${element[3]}일 ${element[4]}시 ${element[5]}분 ${element[6]}초 : ${element[7]}\n`;
        });
        let workDurationStr: string = '';
        if (workDuration !== 0){
          const underHour = (Math.floor((workDuration % 3600) / 360) / 10);
          workDurationStr = (Math.floor(workDuration / 3600)).toString() + (underHour === 0 ? '' : '.' + underHour.toString().split('.')[1]) + '시간';
        }
        const respondText = `총 근무: ${workDurationStr}\n\n` + resultListString;

        const data = {
          "response_type": "ephemeral",
          "text": "월별 조회 결과 - " + targetyear.toString() + '년 ' + targetmonth.toString() + '월',
          "attachments": [
            {
              "text": respondText
            }
          ]
        };
        respond(data);
      }
      catch(e) {
        console.log(e);
      }
    });
    

    http.createServer(app).listen(port, () => {
      console.log(`access manager server listening on port ${port}`);
    })
  }
}