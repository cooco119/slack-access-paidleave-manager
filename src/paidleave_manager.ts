import * as fs from 'fs';
import axios from 'axios';
import { RTMClient, WebClient } from '@slack/client';
import { Request } from 'express-serve-static-core';
import { Response } from 'express';
import { error } from 'util';
const { createMessageAdapter } = require('@slack/interactive-messages');
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const csvWriter = require('csv-write-stream');
const Papa = require('papaparse');

export default class PaidleaveManager{
  token1: string;
  token2: string;
  rtm: RTMClient;
  web: WebClient;
  csvfilePrefix: string;
  // @ts-ignore Member 'slackInteractions' implicitly has an 'any' type.
  slackInteractions;

  constructor(){
    this.csvfilePrefix = process.cwd().toString() + '/../data/paidleave/';
    const tokenfile = process.cwd().toString() + '/secure/paidleave/slack_token';
    [this.token1, this.token2] = fs.readFileSync(tokenfile).toString().split('\n');

    this.rtm = new RTMClient(this.token1);
    this.rtm.start();
    this.web = new WebClient(this.token2);

    const signingFile = process.cwd().toString() + '/secure/paidleave/slack_signing_secret';
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
        return response.user.profile.display_name;
      }
    });
  }

  // @ts-ignore
  private async sortAndRewrite(csv){
    console.log("csv: ", csv);

    let name, year, month, day, type, used;

    let csvdata: Array<Array<string>> = [];
    await Papa.parse(fs.readFileSync(csv).toString(), {
      worker: true,
      // @ts-ignore
      step: (results) => {
        csvdata.push(results.data[0]);
      }
    })
    let dataNoHeader = csvdata.slice(1, csvdata.length-1);
    dataNoHeader.sort((a: Array<string>, b: Array<string>): number => {
      const dateA = new Date(parseInt(a[1]), parseInt(a[2])-1, parseInt(a[3]));
      const dateB = new Date(parseInt(b[1]), parseInt(b[2])-1, parseInt(b[3]));

      if (dateA > dateB) return 1;
      if (dateA < dateB) return -1;

      return 0;
    });

    const writer = csvWriter({headers: ['name', 'year', 'month', 'day', 'type', 'used'], sendHeaders: true});
    writer.pipe(fs.createWriteStream(csv, { flags: 'w' }));
    dataNoHeader[0][5] = dataNoHeader[0][4] === "연차" ? '1' : '0.5';
    writer.write(dataNoHeader[0]);
    for (let i = 1; i < dataNoHeader.length; i++){
      if (dataNoHeader[i][0] === ''){
        continue;
      }
      let lastValue = parseFloat(dataNoHeader[i-1][5]);
      dataNoHeader[i][5] = dataNoHeader[i][4] === "연차" ? (lastValue + 1).toString() : (lastValue + 0.5).toString(); 
      writer.write(dataNoHeader[i]);
    }
    writer.end();

  }

  // @ts-ignore
  private async updateCSV (message, type, year, month, day) {
    const user = message.user;
    const channel = message.channel;
    const name = await this.getUserName(user);

    try{
      let used = 0;
      const targetfile = this.csvfilePrefix + name + '.csv';
      if (fs.existsSync(targetfile)){
        let csvdata: Array<Object> = [];
        await Papa.parse(fs.readFileSync(targetfile).toString(), {
          worker: true,
          // @ts-ignore
          step: (results) => {
            csvdata.push(results.data[0]);
          }
        })
        for (let i = 1; i < csvdata.length - 1; i++ ){
          // @ts-ignore
          if (year === csvdata[i][1] && month === csvdata[i][2] && day === csvdata[i][3]){
            // @ts-ignore
            const response = `오류: 이미 해당 날짜에 ${csvdata[i][4]} 신청이 완료되었습니다.`;
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
        const recent = csvdata[csvdata.length - 2];
        // @ts-ignore
        used = parseFloat(recent[recent.length - 1]);
      }
      
      if (type === "연차"){
        used += 1;
      }
      else if (type === "반차(오전)" || type === "반차(오후)") {
        used += 0.5;
      }
      else {
        throw error("Not a defined type");
      }

      // Write params into csv file.
      const csvfile = this.csvfilePrefix + name + '.csv';
      let sendHeaderOrNot: boolean = false;
      if (!fs.existsSync(csvfile)) sendHeaderOrNot = true;
      const writer = csvWriter({headers: ['name', 'year', 'month', 'day', 'type', 'used'], sendHeaders: sendHeaderOrNot});
      writer.pipe(fs.createWriteStream(csvfile, { flags: 'a+' }));
      writer.write([name, year, month, day, type, used]);
      writer.end();

      //@ts-ignore
      setTimeout((csvfile) => {this.sortAndRewrite(csvfile)}, 2000, csvfile);

      const channelMsg = `[${name}] ${year}년 ${month}월 ${day}일에 ${type} 사용 신청`;
      // @ts-ignore
      this.web.chat.postMessage({channel: message.channel, text: channelMsg})
      // @ts-ignore
      .then(res => {
        console.log(res);
      })
      .catch(console.error);
      return;
    }
    catch(e) { console.log(e) }
    return;
  }

  private readPaidleaveChannel() {
    
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
            if (message.text === undefined){
              console.log("undefined message");
              return;
            }

            // Check if it is a command
            if (message.text.substring(0,2) === '//'){
              console.log(message);
              const commands = message.text.substring(2, message.text.length);
              let command, arg1, arg2, arg3;
              [command, arg1, arg2, arg3] = commands.split(' ');
              console.log(command, arg1, arg2, arg3);
              
              this.web.chat.delete({channel: message.channel, ts: message.ts})
              // @ts-ignore
              .then(res => {
                console.log(res);
              })
              .catch(console.error);

              if (command === "연차"){
                if (arg1 && arg2 && !arg3) {
                  let year = "ff", month = "ff", day = "ff";
                  name = arg1;
                  [year, month, day] = arg2.split('.');

                  try{
                    // @ts-ignore
                    let testDate = new Date(year, month - 1, day);
                    if (testDate.getFullYear().toString() !== year || (testDate.getMonth() + 1).toString() !== month || testDate.getDate().toString() !== day){
                      const response = "오류: 존재하지 않는 날짜.";
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
                  catch(e){
                    console.log(e);
                    const response = "오류: 존재하지 않는 날짜.";
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
                    this.updateCSV(message, "연차", year, month, day);
                  }
                  catch(e) {
                    console.log(e);
                    this.web.chat.postEphemeral({channel: message.channel, text: "타입 에러 발생", user: message.user})
                    // @ts-ignore
                    .then(res => {
                      console.log(res);
                    })
                    .catch(console.error);
                    return;
                  }
                  return;  
                }
                else {
                  const response = "연차 명령어 오류.\n다음 형식으로 입력하십시오.\n\n//연차 [이름] [날짜]";;
                  this.web.chat.postEphemeral({channel: message.channel, text: response, user: message.user})
                  // @ts-ignore
                  .then(res => {
                    console.log(res);
                  })
                  .catch(console.error);
                  return;  
                }
              }
              else if (command === "반차"){
                if (arg1 && arg2 && arg3) {
                  let year = "ff", month = "ff", day = "ff", type;
                  name = arg1;
                  type = arg3;
                  [year, month, day] = arg2.split('.');
                  console.log(year, month, day);
                  if (month === undefined || day === undefined){
                    const response = "반차 명령어 오류.\n다음 형식으로 입력하십시오.\n\n//반차 [이름] [날짜] [오전|오후]";
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
                    let testDate = new Date(year, month - 1, day);
                    if (testDate.getFullYear().toString() !== year || (testDate.getMonth() + 1).toString() !== month || testDate.getDate().toString() !== day){
                      const response = "오류: 존재하지 않는 날짜.";
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
                  catch(e){
                    console.log(e);
                    const response = "오류: 존재하지 않는 날짜.";
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
                    this.updateCSV(message, "반차(" + type + ")", year, month, day);
                  }
                  catch (e) {
                    console.log(e);
                    // @ts-ignore
                    this.web.chat.postEphemeral({channel: message.channel, text: '타입 에러 발생', user: message.user})
                    // @ts-ignore
                    .then(res => {
                      console.log(res);
                    })
                    .catch(console.error);
                    return;
                  }
                  return;  
                }
                else {
                  const response = "반차 명령어 오류.\n다음 형식으로 입력하십시오.\n\n//반차 [이름] [날짜] [오전|오후]";
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
              else if (command === "조회"){
                if (!arg1 && !arg2 && !arg3){
                  let responseMsg = "";
                  let name = await this.getUserName(message.user);
                  let totalUse = '';
                  const targetfile = this.csvfilePrefix + name + '.csv';
                  if (!fs.existsSync(targetfile)){
                    const response = "해당 ID에 대한 기록 존재하지 않음";
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
                    await Papa.parse(fs.readFileSync(targetfile).toString(), {
                      // @ts-ignore
                      complete: (result) => {
                        const length = result.data.length;
                        console.log(result.data);
                        totalUse = `총 사용 횟수 : ${result.data[length-2][5]}\n`;
                        // @ts-ignore
                        result.data.forEach(element => {
                          if (element.length === 1 || element[0] === 'name'){
                            return;
                          }
                          responseMsg += `\t${element[1]}년 ${element[2]}월 ${element[3]}일: ${element[4]}\n`;
                        });
                      }
                    });
                    responseMsg = totalUse + responseMsg;
                  }
                  catch(e){
                    console.log(e);
                    if (!fs.existsSync(targetfile)){
                      const response = '연차 사용 내역 없음';
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
                  try{
                    // @ts-ignore
                    this.web.chat.postEphemeral({channel: message.channel, text: responseMsg, user: message.user})
                    // @ts-ignore
                    .then(res => {
                      console.log(res);
                    })
                    .catch(console.error);
                    return;
                  }
                  catch(e){
                    console.log(e);
                    const response = '에러!';
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
                else {
                  const response = "조회 명령어 오류.\n다음 형식으로 입력하십시오.\n\n//조회";
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
              else {
                // error!
              }
            }
          })
        }
      }
    )
  }

  public start(){

    console.log("Starting schedule-manager");
    this.readPaidleaveChannel();

  }
}