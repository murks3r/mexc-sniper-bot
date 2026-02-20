use std::time::Duration;
use tokio::time::interval;
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardMarkup, InlineKeyboardButton};

#[tokio::main]
async fn main() {
    let bot_token = std::env::var("TELEGRAM_BOT_TOKEN").expect("TELEGRAM_BOT_TOKEN not set");
    let admin_id: i64 = std::env::var("TELEGRAM_ADMIN_USER")
        .expect("TELEGRAM_ADMIN_USER not set")
        .parse()
        .expect("Admin ID must be a valid integer");

    let bot = Bot::new(bot_token);

    let mut interval = interval(Duration::from_secs(60));
    loop {
        interval.tick().await;

        match check_for_new_listings().await {
            Ok(listings) => {
                for listing in listings {
                    let message = format!(
                        "🆕 NEUES LISTING ENTDECKT!\n💎 Token: ${}\n⏰ Zeit: {}\n📊 Pattern: sts:{}",
                        listing.token, listing.time, listing.pattern,
                    );

                    let keyboard = InlineKeyboardMarkup::new(vec![
                        vec![
                            InlineKeyboardButton::callback("SNIPE JETZT", "snipe_now"),
                            InlineKeyboardButton::callback("ANALYSE MEHR", "analyze_more"),
                        ],
                    ]);

                    bot.send_message(admin_id, message)
                        .reply_markup(keyboard)
                        .await
                        .unwrap();
                }
            }
            Err(err) => {
                eprintln!("Fehler beim Überprüfen der Listings: {:?", err);
            }
        }
    }
}

async fn check_for_new_listings() -> Result<Vec<Listing>, Box<dyn std::error::Error>> {
    // API-Logik: MEXC-Daten abrufen und neue Listings filtern
    Ok(Vec::new()) // Platzhalter
}

struct Listing {
    token: String,
    time: String,
    pattern: String,
}