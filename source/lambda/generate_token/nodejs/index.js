// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const { DynamoDBDocument } = require("@aws-sdk/lib-dynamodb");
const { DynamoDB } = require("@aws-sdk/client-dynamodb");
const awsSMD = require("aws-secure-media-delivery");

const docClient = process.env.METRICS == "true" ? DynamoDBDocument.from(new DynamoDB({ customUserAgent: process.env.SOLUTION_IDENTIFIER })) : DynamoDBDocument.from(new DynamoDB());

const stackName = process.env.STACK_NAME;
const tableName = process.env.TABLE_NAME;

const response400 = {
    statusCode: 400,
    body: "Bad request"
}


awsSMD.Secret.setDEBUG(true);
let secret = new awsSMD.Secret(stackName,4);
secret.initSMClient();
awsSMD.Token.setDEBUG(true)
let token = new awsSMD.Token(secret);

function _populate_country_region_city(token_policy, headers) {
    const viewer_attributes = {};

    if(token_policy['co']){
        if(headers['cloudfront-viewer-country']){
            viewer_attributes['co'] = headers['cloudfront-viewer-country'];
        } else if(!token_policy['co_fallback']) {
            return response400;
        }
    }
   
    if(token_policy['reg']){
        if(headers['cloudfront-viewer-country-region']){
            viewer_attributes['reg'] = headers['cloudfront-viewer-country-region'];
        } else if(!token_policy['reg_fallback']) {
            return response400;
        }
    }

    if(token_policy['cty']){
        if(headers['cloudfront-viewer-city']){
            viewer_attributes['cty'] = headers['cloudfront-viewer-city'];
        } else if(!token_policy['cty_fallback']) {
            return response400;
        }
    }

    return viewer_attributes;
}

function _populate_viewer_attributes(token_policy, viewer_ip, headers, request_querystrings) {
    let viewer_attributes = _populate_country_region_city(token_policy, headers);
    if (viewer_attributes.statusCode) return viewer_attributes;

    if(token_policy['ip']) viewer_attributes['ip'] = viewer_ip;

    if(token_policy['headers'] && token_policy['headers'].length > 0){
        viewer_attributes['headers'] = headers;
    }

    if(token_policy['querystrings'] && token_policy['querystrings'].length > 0){
        viewer_attributes['qs'] = request_querystrings;
    }

    return viewer_attributes;
}

exports.handler = async (event, context) => {
    
    console.log(JSON.stringify(event))
    let id;
    const headers = event.headers;
    let request_querystrings = event.queryStringParameters;
    let viewer_ip;

    if(event['queryStringParameters'] && event.queryStringParameters['id']){
        id = event.queryStringParameters['id'];
        if(!/^\w+$/.test(id) || (id.length > 200)) return response400;
		delete request_querystrings['id'];
    } else {
        return response400;
    }

    if(headers['cloudfront-viewer-address']){
        viewer_ip = headers['cloudfront-viewer-address'].substring(0, headers['cloudfront-viewer-address'].lastIndexOf(':'))
    } else {
        viewer_ip = event.requestContext.http.sourceIp;
    }

    const params = {
        TableName: tableName,
        Key:{"id": id}
    };

    const video_metadata = await docClient.get(params);
    console.log("From DynamoDB:"+JSON.stringify(video_metadata));
    if(!video_metadata.Item){
        return {
        "statusCode": 404,
        "body": 'No video asset for the given ID'
        };
    }

    const endpoint_hostname = video_metadata.Item['endpoint_hostname'];
    const video_url = video_metadata.Item['url_path'];
    const token_policy = video_metadata.Item.token_policy;
    const viewer_attributes = _populate_viewer_attributes(token_policy, viewer_ip, headers, request_querystrings);
    

	let original_url;
	if(endpoint_hostname && video_url){
		original_url = endpoint_hostname + video_url;
	} else {
		original_url = null;
	}
    const playback_url = await token.generate(viewer_attributes, original_url, token_policy);
    const body = {
        "playback_url": playback_url,
        "token_policy" : {
            "ip": token_policy.ip ? 1 : 0,
            "ip_value": viewer_ip,
            "ua": token_policy.headers.includes('user-agent') ? 1 : 0,
            "ua_value": headers['user-agent'],
            "referer": token_policy.headers.includes('referer') ? 1 : 0,
            "referer_value": headers['referer']
        }
    };
    return {
        "statusCode": 200,
        "body": 
        JSON.stringify(body)
    };

};