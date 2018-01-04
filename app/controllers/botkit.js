//CONFIG===============================================

/* Uses the slack button feature to offer a real time bot to multiple teams */
var Botkit = require('botkit');
var mongoUri = process.env.MONGODB_URI || 'mongodb://localhost/database';
var botkit_mongo_storage = require('../../config/botkit_mongo_storage')({ mongoUri: mongoUri });

if (!process.env.SLACK_ID || !process.env.SLACK_SECRET || !process.env.PORT) {
  console.log('Error: Specify SLACK_ID SLACK_SECRET and PORT in environment');
  process.exit(1);
};

var controller = Botkit.slackbot({
  storage: botkit_mongo_storage, 
  studio: process.env.STUDIO_TOKEN, 
  interactive_replies: true,
  debug: true
}).configureSlackApp({
    clientId: process.env.SLACK_ID,
    clientSecret: process.env.SLACK_SECRET,
    scopes: ['commands', 'bot']
});

exports.controller = controller;

controller.setupWebserver((process.env.PORT), function(err, webserver) {
    controller.createWebhookEndpoints(controller.webserver);

    controller.createOauthEndpoints(controller.webserver, function(err, req, res) {
        if (err) {
            res.status(500).send('ERROR: ' + err);
        } else {
            res.send('Success!');
        }
    });

    // If not also opening an RTM connection
    controller.startTicking();
});

//CONNECTION FUNCTIONS=====================================================
exports.connect = function(team_config){
  var bot = controller.spawn(team_config);
  controller.trigger('create_bot', [bot, team_config]);
};

exports.authorize = function(req, res) {
  controller.handleWebhookPayload(req, res);
}

// just a simple way to make sure we don't
// connect to the RTM twice for the same team
var _bots = {};

function trackBot(bot) {
  _bots[bot.config.token] = bot;
};

controller.on('create_bot',function(bot,team) {

  if (_bots[bot.config.token]) {
    // already online! do nothing.
    console.log("already online! do nothing.")
  }
  else {
    bot.startRTM(function(err) {

      if (!err) {
        trackBot(bot);

        console.log("RTM ok")

        controller.saveTeam(team, function(err, id) {
          if (err) {
            console.log("Error saving team")
          }
          else {
            console.log("Team " + team.name + " saved")
          }
        })
      }

      else{
        console.log("RTM failed")
      }

      // bot.api.channels.list({},function(err,response) {
      //   //Do something...
      // })

      bot.startPrivateConversation({ user: team.createdBy },function(err,convo) {
        if (err) {
          console.log(err);
        } else {
          convo.say(
              {
                attachments:
                [
                  {
                    title: 'Hey there, player! Welcome to the Labyrinth minigame! Are you and your team ready?',
                    callback_id: 'IntroMessage',
                    attachment_type: 'default',
                    actions: [
                        {
                          "name" : "enterlabyrinth",
                          "text": "Enter Labyrinth",
                          "value": "enter",
                          "type": "button",
                        },
                        {
                          "name" : "quit",
                          "text": "No, I quit.",
                          "value": "quit",
                          "type": "button",
                        }
                    ]
                  }
                ]
              }
          );

        }
      });

    });
  }
});

//REACTIONS TO EVENTS==========================================================

// Handle events related to the websocket connection to Slack
controller.on('rtm_open',function(bot) {
  console.log('** The RTM api just connected!');

});

controller.on('rtm_close',function(bot) {
  console.log('** The RTM api just closed');
  // you may want to attempt to re-open
});



//DIALOG ======================================================================
controller.on('interactive_message_callback', function(bot, message) {
  // if(message.callback_id == 'IntroMessage') {
    if(message.actions[0].name.match("enterlabyrinth") || message.actions[0].name.match("newlabyrinth")){ 
      bot.reply(message, {
          text: "",
          channel: daedalusplaytestid,
          icon_url: daedalusemoji,
          attachments: [
              {
                  title: 'Room 1 - Daedalus',
                  callback_id: 'Room 1',
                  text: 'You enter a dimly lit room and Daedalus greets you. “Welcome to my Labyrinth. You must find your way to Room 10 and then back to me. Do this before your opponents, and you will achieve the greatest victory of all. To get the key to a room, you’ll need to solve a puzzle. Ready to start? All you need to do is choose a room.” You look around the room, and see four silver pads on the floor. You hesitantly advance towards one…\nBefore you go, Daedalus tosses something toward you. Your hand darts out and catches it: a bronze coin embossed with the swirling patterns of the labyrinth.',
                  attachment_type: 'default',
                  actions: [
                      {
                          "name":"Door to Room 5",
                          "text": "Enter Room 5",
                          "value": "5",
                          "style": solvedPuzzles[4],
                          "type": "button"
                      },
                      {
                          "name":"Door to Room 8",
                          "text": "Enter Room 8",
                          "value": "8",
                          "style": solvedPuzzles[7],
                          "type": "button"
                      },
                      {
                          "name":"Door to Room 4",
                          "text": "Enter Room 4",
                          "value": "4",
                          "style": solvedPuzzles[3],
                          "type": "button"
                      }
                  ]
              }
          ]
      });
    }
    else if(message.actions[0].name.match("quit")){
      bot.closeRTM();
    }
  // }
});

controller.hears('hello','direct_message',function(bot,message) {
  bot.reply(message,'Hello!');
});

controller.hears('^stop','direct_message',function(bot,message) {
  bot.reply(message,'Goodbye');
  bot.rtm.close();
});

controller.hears('^storage (.*)','direct_message',function(bot,message) {
  var theBot = bot;

  console.log("message: " + JSON.stringify(message));
  var storageType = message.match[1];

  controller.storage[storageType].all(function(err,storage) {

    console.log("storage: " + JSON.stringify(storage));

    theBot.reply(message, JSON.stringify(storage));

    if (err) {
      throw new Error(err);
    }

    // connect all teams with bots up to slack!
    for (var t  in storage) {
      if (storage[t].bot) {
        var bot = controller.spawn(storage[t]).startRTM(function(err) {
          if (err) {
            console.log('Error connecting bot to Slack:',err);
          } else {
            trackBot(bot);
          }
        });
      }
    }

  });
});

// controller.on('direct_message,mention,direct_mention',function(bot,message) {
//   bot.api.reactions.add({
//     timestamp: message.ts,
//     channel: message.channel,
//     name: 'robot_face',
//   },function(err) {
//     if (err) { console.log(err) }
//     bot.reply(message,'I heard you loud and clear boss.');
//   });
// });

controller.on('direct_message,mention,direct_mention,ambient',function(bot,message) {
  var theBot = bot;
  controller.storage[storageType].all(function(err,storage) {

    console.log("storage: " + JSON.stringify(storage));

    theBot.reply(message, JSON.stringify(storage));

    if (err) {
      throw new Error(err);
    }

    // connect all teams with bots up to slack!
    for (var t  in storage) {
      if (storage[t].bot) {
        var bot = controller.spawn(storage[t]).startRTM(function(err) {
          if (err) {
            console.log('Error connecting bot to Slack:',err);
          } else {
            trackBot(bot);
          }
        });
      }
    }

  });
});

controller.on('bot_channel_join',function(bot,message) {
  controller.studio.run(bot, 'channel_join', message.user, message.channel, message).catch(function(err) {
          debug('Error: encountered an error loading onboarding script from Botkit Studio:', err);
      });
});

controller.storage.teams.all(function(err,teams) {

  console.log(teams)

  if (err) {
    throw new Error(err);
  }

  // connect all teams with bots up to slack!
  for (var t  in teams) {
    if (teams[t].bot) {
      var bot = controller.spawn(teams[t]).startRTM(function(err) {
        if (err) {
          console.log('Error connecting bot to Slack:',err);
        } else {
          trackBot(bot);


          bot.startPrivateConversation({ user: teams[t].createdBy },function(err,convo) {
                if (err) {
                  console.log(err);
                } else {
                  convo.say(
                      {
                        attachments:
                        [
                          {
                            title: 'Hey there, player! Welcome to the Labyrinth minigame! Are you and your team ready?',
                            callback_id: 'IntroMessage',
                            attachment_type: 'default',
                            actions: [
                                {
                                  "name" : "enterlabyrinth",
                                  "text": "Enter Labyrinth",
                                  "value": "enter",
                                  "type": "button",
                                },
                                {
                                  "name" : "quit",
                                  "text": "No, I quit.",
                                  "value": "quit",
                                  "type": "button",
                                }
                            ]
                          }
                        ]
                      }
                  );

                }
              });

        }
      });
    }
  }

});
