const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// 감시 대상 유저 배열
const TARGET_USER_IDS = ['28660300270188259', '28658691976131524', '28660200967372522'];
const CHECK_INTERVAL = 30000; 

let lastPostIds = {};
let isMonitoring = false;

console.log("🚀 다중 유저 감시 및 정밀 링크 모드 가동");

async function fetchUserPost(profileId) {
    const url = `https://m.stock.naver.com/front-api/profile/user/discussionList`;
    try {
        const response = await axios.get(url, {
            params: { profileId: profileId, pageSize: 10 },
            headers: {
                'referer': `https://m.stock.naver.com/profile/${profileId}`,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const posts = response.data?.result?.posts;
        return (posts && posts.length > 0) ? posts[0] : null;
    } catch (error) {
        console.error(`❌ [${profileId}] 호출 실패: ${error.message}`);
        return null;
    }
}

function cleanContent(html) {
    if (!html) return "";
    return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]*>?/gm, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<");
}

async function checkAllUsers(chatId) {
    if (!isMonitoring) return;

    for (const profileId of TARGET_USER_IDS) {
        const post = await fetchUserPost(profileId);
        
        if (post) {
            const currentPostId = post.postId;
            const nickname = post.nickname || "알 수 없는 사용자";

            // 1. 초기화 로직
            if (!lastPostIds[profileId]) {
                lastPostIds[profileId] = currentPostId;
                console.log(`✅ [${nickname}] 감시 시작`);
            } 
            // 2. 새 글 발견 시 알림
            else if (lastPostIds[profileId] !== currentPostId) {
                lastPostIds[profileId] = currentPostId;
                
                // 🔗 알려주신 링크 구조 반영 (국내주식/해외주식 구분 처리)
                const stockType = post.item?.discussionType === 'domesticStock' ? 'domestic/stock' : 'world/stock';
                const itemCode = post.item?.itemCode;
                const postLink = `https://m.stock.naver.com/${stockType}/${itemCode}/discussion/${currentPostId}?from=profile`;

                const fullContent = cleanContent(post.contentSwReplaced);

                const alertMsg = 
`🔔 **새 글 알림**

👤 **작성자**: ${nickname}
🏢 **종목**: ${post.item?.itemName}
📝 **제목**: ${post.title}

------------------------------------------
${fullContent.substring(0, 1500)}...

🔗 [게시글 원문 읽기](${postLink})`;

                bot.sendMessage(chatId, alertMsg, { parse_mode: 'Markdown', disable_web_page_preview: false });
                console.log(`✨ [${nickname}] 새 글 알림 발송`);
            }
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // 유저 간 1초 간격
    }

    setTimeout(() => checkAllUsers(chatId), CHECK_INTERVAL);
}

bot.onText(/\/on/, (msg) => {
    if (isMonitoring) return;
    isMonitoring = true;
    lastPostIds = {}; 
    bot.sendMessage(msg.chat.id, `🚀 ${TARGET_USER_IDS.length}명에 대한 실시간 감시를 시작합니다.`);
    checkAllUsers(msg.chat.id);
});

bot.onText(/\/off/, (msg) => {
    isMonitoring = false;
    bot.sendMessage(msg.chat.id, "🛑 모니터링 중단됨");
});