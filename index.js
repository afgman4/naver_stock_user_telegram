process.env.NTBA_FIX_319 = 1; 
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first'); // 이 줄이 AggregateError를 해결합니다.

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

const token = process.env.TELEGRAM_TOKEN;
const slackUrl = process.env.SLACK_WEBHOOK_URL;

const bot = new TelegramBot(token, { polling: true });

const TARGET_PROFILE_ID = '28660300270188259';
const CHECK_INTERVAL = 30000; 

let lastPostId = null;
let isMonitoring = false;

console.log("🚀 본문 전체 추출 모드 가동");

async function fetchNaverPosts() {
    const url = `https://m.stock.naver.com/front-api/profile/user/discussionList`;
    try {
        const response = await axios.get(url, {
            params: { profileId: TARGET_PROFILE_ID, pageSize: 50 },
            headers: {
                'referer': `https://m.stock.naver.com/profile/${TARGET_PROFILE_ID}`,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const posts = response.data?.result?.posts;
        return (posts && posts.length > 0) ? posts[0] : null;
    } catch (error) {
        console.error(`❌ 호출 실패: ${error.message}`);
        return null;
    }
}

// HTML 태그 제거 함수 (네이버 본문의 <br> 등을 줄바꿈으로 변환)
function cleanContent(html) {
    if (!html) return "";
    return html
        .replace(/<br\s*\/?>/gi, "\n") // <br> 태그를 실제 줄바꿈으로
        .replace(/<\/p>/gi, "\n")      // </p> 태그를 줄바꿈으로
        .replace(/<[^>]*>?/gm, "")    // 나머지 모든 HTML 태그 제거
        .replace(/&nbsp;/g, " ")      // 공백 문자 변환
        .replace(/&gt;/g, ">")        // 부등호 변환
        .replace(/&lt;/g, "<");
}

async function monitor(chatId) {
    if (!isMonitoring) return;

    const post = await fetchNaverPosts();
    if (post) {
        const currentPostId = post.postId;

        if (lastPostId === null) {
            lastPostId = currentPostId;
            const fullContent = cleanContent(post.contentSwReplaced);
            
            const welcomeMsg = 
`✅ **모니터링 연결 성공! 현재 최신글 전문**

🏢 **종목**: ${post.item?.itemName}
📝 **제목**: ${post.title}
📅 **작성일**: ${post.writtenAt}
------------------------------------------
${fullContent.substring(0, 3000)} // 텔레그램 글자 제한 고려`;

            bot.sendMessage(chatId, welcomeMsg);
        } 
        else if (lastPostId !== currentPostId) {
            lastPostId = currentPostId;
            const fullContent = cleanContent(post.contentSwReplaced);

            const alertMsg = 
`🔔 **새 글 알림 (본문 포함)**

🏢 **종목**: ${post.item?.itemName}
📝 **제목**: ${post.title}
------------------------------------------
${fullContent.substring(0, 3000)}`;

            bot.sendMessage(chatId, alertMsg);
            console.log(`✨ 새 글 본문 발송 완료: ${post.title}`);
        }
    }
    setTimeout(() => monitor(chatId), CHECK_INTERVAL);
}

bot.onText(/\/on/, (msg) => {
    isMonitoring = true;
    lastPostId = null;
    bot.sendMessage(msg.chat.id, "🚀 모니터링 시작 (본문을 직접 긁어옵니다)");
    monitor(msg.chat.id);
});

bot.onText(/\/off/, (msg) => {
    isMonitoring = false;
    bot.sendMessage(msg.chat.id, "🛑 중단됨");
});
