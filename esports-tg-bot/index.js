import { createClient } from '@supabase/supabase-js';

// ⚠️ IMPORTANT: Put your REAL Supabase URL and Service Role Key here
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY'; // Use Service Role key to bypass RLS policies
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BOT_TOKEN = '8835569211:AAG_-b0Z08Jf8IKFAf6npU-0vfqlqWaPBmc';
const WITHDRAW_CHAT = '-1004422203278';
const TOURNEY_CHAT = '-1004409101344';

// Helper to send Telegram messages
const sendTelegramAlert = async (chatId, text) => {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
    const data = await res.json();
    if (!data.ok) console.error("TG Error:", data.description);
  } catch (e) {
    console.error("TG Alert Failed:", e.message);
  }
};

console.log("🤖 Telegram Bot Worker Started! Listening for database changes...");

// ==========================================
// 🎧 LISTEN TO SUPABASE REALTIME EVENTS
// ==========================================
supabase
  .channel('telegram-alerts')
  
  // 1. WATCH FOR NEW WITHDRAWALS
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, (payload) => {
    const tx = payload.new;
    if (tx.type === 'withdraw' && tx.status === 'pending') {
      console.log(`💸 New withdrawal detected from ${tx.uid}`);
      sendTelegramAlert(
        WITHDRAW_CHAT, 
        `🚨 <b>NEW WITHDRAWAL REQUEST</b> 🚨\n\n👤 User ID: <code>${tx.uid}</code>\n💰 Amount: ₹${tx.amount}\n\n<i>Check Admin Panel to approve.</i>`
      );
    }
  })

  // 2. WATCH FOR TOURNAMENT SLOTS FILLING
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournaments' }, (payload) => {
    const match = payload.new;
    
    // Only check if it's an upcoming/ongoing match with a valid slot count
    if (match.status.includes('upcoming') || match.status.includes('ongoing')) {
      const currentJoined = match.joinedUsers ? match.joinedUsers.length : 0;
      const totalSlots = match.totalSlots || 0;
      
      if (totalSlots > 0) {
        const halfSlots = Math.floor(totalSlots / 2);
        const alertThreshold = Math.max(1, halfSlots - 8); // e.g., 48 slots -> half is 24 -> alert at 16

        // Check if it exactly hits one of our milestones so we don't spam the chat every time 1 person joins
        let statusText = null;
        if (currentJoined === alertThreshold) statusText = "FILLING FAST 🔥";
        else if (currentJoined === halfSlots) statusText = "HALF FULL! ⚡️";
        else if (currentJoined === totalSlots) statusText = "FULL! 🛑";

        if (statusText) {
          console.log(`🏆 Tournament ${match.title} hit a milestone: ${statusText}`);
          sendTelegramAlert(
            TOURNEY_CHAT, 
            `🎮 <b>${match.title}</b> is ${statusText}\n\n👥 <b>Slots Filled:</b> ${currentJoined} / ${totalSlots}\n\n<i>Hurry up and grab your slots before it's too late!</i>`
          );
        }
      }
    }
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log("✅ Successfully connected to Supabase Realtime!");
    }
  });