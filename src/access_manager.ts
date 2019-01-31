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
  token1: string;
  token2: string;
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
    [this.token1, this.token2] = fs.readFileSync(tokenfile).toString().split('\n');

    this.rtm = new RTMClient(this.token1);
    this.rtm.start();
    this.web = new WebClient(this.token2);

    const signingFile = process.cwd().toString() + '/secure/access/slack_signing_secret';
    const signingSecret = fs.readFileSync(signingFile).toString();
    this.slackInteractions = createMessageAdapter(signingSecret);
  }

  private async getUserName(user: string){
    const queryString = require('query-string');
    const data = {
      'token': this.token1,
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

  // @ts-ignore
  private async searchDaily (message, targetyear, targetmonth, targetday) {
    const user = message.user;
    const channel = message.channel;
    const name = await this.getUserName(user);
    const targetfile = this.csvfilePrefix + name + '.csv';

    if (!fs.existsSync(targetfile)){
      const respond = "해당 ID에 대한 기록 존재하지 않음";

      this.web.chat.postEphemeral({channel: channel, text: respond, user: user});
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

      const respondText = "일별 조회\n\n" + `총 근무: ${workDurationStr}, 출근: ${attendTime.toLocaleTimeString()}, ${goHome === 0 ? remaining : '퇴근: ' + goHomeTime.toLocaleTimeString()}\n\n` + resultListString;

      this.web.chat.postEphemeral({channel: channel, text: respondText, user: user});

    }
    catch(e) {
      console.log(e);
    }
  }

  // @ts-ignore
  private async searchWeekly (message, targetyear, targetmonth, targetweek) {

    const user = message.user;
    const channel = message.channel;
    const name = await this.getUserName(user);

    const targetfile = this.csvfilePrefix + name + '.csv';
    if (!fs.existsSync(targetfile)){
      const respond = "해당 ID에 대한 기록 존재하지 않음";

      this.web.chat.postEphemeral({channel: channel, text: respond, user: user});
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
      const respondText = "주별 조회\n\n" + `총 근무: ${workDurationStr}\n\n` + resultListString;
      
      this.web.chat.postEphemeral({channel: channel, text: respondText, user: user});
    }
    catch(e) {
      console.log(e);
    }
  }

  //@ts-ignore
  private async searchMonthly (message, targetyear, targetmonth) {

    const user = message.user;
    const channel = message.channel;
    const name = await this.getUserName(user);

    const targetfile = this.csvfilePrefix + name + '.csv';
    if (!fs.existsSync(targetfile)){
      const respond = "해당 ID에 대한 기록 존재하지 않음";

      this.web.chat.postEphemeral({channel: channel, text: respond, user: user});
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
      const respondText = "월별 조회\n\n" + `총 근무: ${workDurationStr}\n\n` + resultListString;

      this.web.chat.postEphemeral({channel: channel, text: respondText, user: user});
    }
    catch(e) {
      console.log(e);
    }
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
            

            // Check if it is a command
            if (message.text.substring(0,2) === '//'){
              console.log(message);
              const commands = message.text.substring(2, message.text.length);
              let command, arg1, arg2;
              [command, arg1, arg2] = commands.split(' ');
              console.log(command, arg1, arg2);
              
              this.web.chat.delete({channel: message.channel, ts: message.ts})
              // @ts-ignore
              .then(res => {
                console.log(res);
              })
              .catch(console.error);
              
              if (arg1 === null || arg1 === undefined){
                const response = "조회 범위 명령어 오류.\n조회하려면 다음과 같이 [일별|주별|월별] 중 한가지를 입력해주세요. \n//조회 [일별|주별|월별]  [날짜 (일별: YYYY.MM.DD | 주별: YYYY.MM.W(1~5) | 월별: YYYY.MM)]";
                // @ts-ignore
                this.web.chat.postEphemeral({channel: message.channel, text: response, user: message.user})
                // @ts-ignore
                .then(res => {
                  console.log(res);
                })
                .catch(console.error);
                return;                
              }
              if (arg2 === null || arg2 === undefined){
                if (arg1 === "일별"){
                  const response = "날짜 명령어 오류.\n일별 조회에 대한 날짜 형식은 다음과 같습니다: YYYY.MM.DD";
                  // @ts-ignore
                  this.web.chat.postEphemeral({channel: message.channel, text: response, user: message.user})
                  // @ts-ignore
                  .then(res => {
                    console.log(res);
                  })
                  .catch(console.error);
                  return;                
                }
                else if (arg1 === "주별"){
                  const response = "날짜 명령어 오류.\n주별 조회에 대한 날짜 형식은 다음과 같습니다: YYYY.MM.WW (W: 해당 주, 1~5)";
                  // @ts-ignore
                  this.web.chat.postEphemeral({channel: message.channel, text: response, user: message.user})
                  // @ts-ignore
                  .then(res => {
                    console.log(res);
                  })
                  .catch(console.error);
                  return;                
                }
                else if (arg1 === "월별"){
                  const response = "날짜 명령어 오류.\n월별 조회에 대한 날짜 형식은 다음과 같습니다: YYYY.MM";
                  // @ts-ignore
                  this.web.chat.postEphemeral({channel: message.channel, text: response, user: message.user})
                  // @ts-ignore
                  .then(res => {
                    console.log(res);
                  })
                  .catch(console.error);
                  return;                
                }
                else {
                  const response = "조회 범위 명령어 오류.\n조회하려면 다음과 같이 [일별|주별|월별] 중 한가지를 입력해주세요. \n//조회 [일별|주별|월별]  [날짜 (일별: YYYY.MM.DD | 주별: YYYY.MM.W(1~5) | 월별: YYYY.MM)]";
                  // @ts-ignore
                  this.web.chat.postEphemeral({channel: message.channel, text: response, user: message.user})
                  // @ts-ignore
                  .then(res => {
                    console.log(res);
                  })
                  .catch(console.error);    
                  return;                
                }
              }
              if (command === "조회"){

                if (arg1 === "일별"){
                  let year = "ff", month = "ff", day = "ff";
                  [year, month, day] = arg2.split('.');
                  try{
                    // @ts-ignore
                    (new Date(year, month, day)).toLocaleDateString();
                  }
                  catch(e){
                    console.log(e);
                    const response = "날짜 명령어 오류.\n일별 조회에 대한 날짜 형식은 다음과 같습니다: YYYY.MM.DD";
                    // @ts-ignore
                    this.web.chat.postEphemeral({channel: message.channel, text: response, user: message.user})
                    // @ts-ignore
                    .then(res => {
                      console.log(res);
                    })
                    .catch(console.error);
                    return;     
                  }
                  this.searchDaily(message, year, month, day);
                  return;
                }
                else if (arg1 === "주별"){
                  let year = "ff", month = "ff", week = "ff";
                  [year, month, week] = arg2.split('.');
                  try{
                    // @ts-ignore
                    (new Date(year, month, 1)).toLocaleDateString();
                    // @ts-ignore
                    if (week < 1 || week > 5){
                      throw Error("Week is not in the range of 1 ~ 5.");
                    }
                  }
                  catch(e){
                    console.log(e);
                    const response = "날짜 명령어 오류.\n주별 조회에 대한 날짜 형식은 다음과 같습니다: YYYY.MM.WW (W: 해당 주, 1~5)";
                    // @ts-ignore
                    this.web.chat.postEphemeral({channel: message.channel, text: response, user: message.user})
                    // @ts-ignore
                    .then(res => {
                      console.log(res);
                    })
                    .catch(console.error);
                    return;     
                  }
                  this.searchWeekly(message, year, month, week);
                  return;

                }
                else if (arg1 === "월별"){
                  let year = "ff", month = "ff", res = undefined;
                  [year, month, res] = arg2.split('.');
                  if (res !== undefined){
                    const response = "월별 조회에 대한 날짜 형식은 다음과 같습니다: YYYY.MM";
                    // @ts-ignore
                    this.web.chat.postEphemeral({channel: message.channel, text: response, user: message.user})
                    // @ts-ignore
                    .then(res => {
                      console.log(res);
                    })
                    .catch(console.error);
                    return;  
                  }
                  try{
                    // @ts-ignore
                    (new Date(year, month, 1)).toLocaleDateString();
                  }
                  catch(e){
                    console.log(e);
                    const response = "월별 조회에 대한 날짜 형식은 다음과 같습니다: YYYY.MM";
                    // @ts-ignore
                    this.web.chat.postEphemeral({channel: message.channel, text: response, user: message.user})
                    // @ts-ignore
                    .then(res => {
                      console.log(res);
                    })
                    .catch(console.error);
                    return;     
                  }
                  this.searchMonthly(message, year, month);
                  return;
                }
              }
              if (command === "h" || command === "help"){
                const response = "자동으로 출퇴근 기록이 저장됩니다.\n또는 '퇴근'이나 '외출'이 들어간 메세지를 분석하여 알아서 저장해줍니다.\n조회하려면 다음을 입력하세요: \n//조회 [일별|주별|월별] [날짜 (일별: YYYY.MM.DD | 주별: YYYY.MM.W(1~5) | 월별: YYYY.MM)]";
                this.web.chat.delete({channel: message.channel, ts: message.ts})
                // @ts-ignore
                .then(res => {
                  console.log(res);
                })
                .catch(console.error);
                // @ts-ignore
                this.web.chat.postEphemeral({channel: message.channel, text: response, user: message.user})
                // @ts-ignore
                .then(res => {
                  console.log(res);
                })
                .catch(console.error);
              }
            }
            // Parse the message if has given format
            else if (message.text.split(' : ').length === 2){
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

  // Entrypoint
  public start(){

    console.log("Starting access-manager");
    // Read access channel and save to csv
    this.readAccessChannel();

    
  }
}