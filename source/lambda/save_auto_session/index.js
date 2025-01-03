// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const { DynamoDB } = require("@aws-sdk/client-dynamodb");
const dynamodb = process.env.METRICS == "true" ?  new DynamoDB({customUserAgent: process.env.SOLUTION_IDENTIFIER}) :  new DynamoDB();

exports.handler = async (event, context) => {
    console.log("event="+JSON.stringify(event));
    if(Array.isArray(event) && event.length >1){
        console.log("number of elements:"+(event.length-1));
        const SECONDS_IN_AN_HOUR = 60 * 60;
        const currentTimestamp = Math.round(Date.now() / 1000);
        const expirationTime = currentTimestamp + 24 * SECONDS_IN_AN_HOUR * parseInt(process.env.TTL);
        for( const item of event.slice(1) ){
            
            const myItem = {
                'session_id': { 'S': item['Data'][0]['VarCharValue']},
                'type': { 'S': 'AUTO' },
                'reason': { 'S': 'COMPROMISED' },
                'score' : { 'N': item['Data'][1]['VarCharValue']},
                'ip_rate' : { 'N': item['Data'][2]['VarCharValue']},
                'ip_penalty' : { 'N': item['Data'][3]['VarCharValue']},
                'referer_penalty' : { 'N': item['Data'][4]['VarCharValue']},
                'ua_penalty' : { 'N': item['Data'][5]['VarCharValue']},
                'last_updated' : { 'N': String(currentTimestamp) },
                'ttl': { 'N': String(expirationTime)}
            }    
            await dynamodb.putItem({
                "TableName": process.env.TABLE_NAME,
                "Item": myItem
            });
            console.log(`Item inserted, sessionid=${item['Data'][0]['VarCharValue']}`);            
        }
        return "OK";
    }else{
        
        throw new Error('Event received must be an array with at least 2 elements');
    }
    
    
};