const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const TARGET_USER_IDS = ['28660300270188259', '28658691976131524', '28660200967372522'];
const CHECK_INTERVAL = 30000; 

let lastPostIds = {};
let isMonitoring = false;

console.log("🚀 다중 유저 모니터링 가동 (본문 100자 제한)");

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
        .replace(/&lt;/g, "<")
        .trim();
}

/**
 * 메시지 생성 및 전송 공통 함수 (본문 100자 제한)
 */
function sendPostMessage(chatId, post, label = "🔔 새 글 알림") {
    const currentPostId = post.postId;
    const nickname = post.nickname || "사용자";
    const stockType = post.item?.discussionType === 'domesticStock' ? 'domestic/stock' : 'world/stock';
    const itemCode = post.item?.itemCode;
    
    // 알려주신 최신 링크 구조
    const postLink = `https://m.stock.naver.com/${stockType}/${itemCode}/discussion/${currentPostId}?from=profile`;
    
    // 본문 추출 및 500자 제한
    let fullContent = cleanContent(post.contentSwReplaced);
    const isTruncated = fullContent.length > 100;
    const displayContent = isTruncated ? fullContent.substring(0, 100) + "..." : fullContent;

    const msg = 
`[${label}]

👤 **작성자**: ${nickname}
🏢 **종목**: ${post.item?.itemName} (${itemCode})
📝 **제목**: ${post.title}
------------------------------------------
${displayContent}

🔗 [원문 읽기](${postLink})`;

    bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', disable_web_page_preview: false });
}

async function checkAllUsers(chatId) {
    if (!isMonitoring) return;

    for (const profileId of TARGET_USER_IDS) {
        const post = await fetchUserPost(profileId);
        
        if (post) {
            const currentPostId = post.postId;

            if (!lastPostIds[profileId]) {
                lastPostIds[profileId] = currentPostId;
                // 첫 실행 시 1건 발송하여 링크 및 데이터 확인
                sendPostMessage(chatId, post, "✅ 연결 성공 (최신글 테스트)");
            } 
            else if (lastPostIds[profileId] !== currentPostId) {
                lastPostIds[profileId] = currentPostId;
                sendPostMessage(chatId, post, "🔔 새 글 알림");
                console.log(`✨ [${post.nickname}] 새 글 발송 완료`);
            }
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setTimeout(() => checkAllUsers(chatId), CHECK_INTERVAL);
}

bot.onText(/\/on/, (msg) => {
    if (isMonitoring) return;
    isMonitoring = true;
    lastPostIds = {}; 
    bot.sendMessage(msg.chat.id, `🚀 ${TARGET_USER_IDS.length}명의 모니터링을 시작합니다. (첫 글 로드 중...)`);
    checkAllUsers(msg.chat.id);
});

bot.onText(/\/off/, (msg) => {
    isMonitoring = false;
    bot.sendMessage(msg.chat.id, "🛑 모니터링이 중단되었습니다.");
});