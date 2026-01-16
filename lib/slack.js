
const Slack = require('slack-node');  // 슬랙 모듈 사용

const webhookUri = "https://hooks.slack.com/services/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";  // Webhook URL


function sendSlack(name,title,link,ntime){
    const slack = new Slack();
    slack.setWebhook(webhookUri);

    slack.webhook({
        channel: "#making-news", // 현 슬랙의 채널 
        username: "newsbot", // 슬랙에서 보여질 웹훅 이름
        attachments:[
            {
                title : title,
                title_link:link,
                text : "*" + name + "*" + '\n' + ntime                
            }
        ]

        }, function (err, response) {
            console.log(response); 
        }
    );
}

module.exports.sendSlack=sendSlack;