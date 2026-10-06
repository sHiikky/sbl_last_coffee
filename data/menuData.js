// data/menuData.js
// СГЕНЕРИРОВАНО из таблицы «Меню для дизайнера (1).xlsx» (листы «Напитки» и «Еда»).
// КБЖУ, составы и объёмы берутся строго из таблицы. В таблице КБЖУ указан на ПОЛНЫЙ
// объём напитка; для меньшего объёма (volumes[].calculated === true) значения
// посчитаны пропорционально объёму. nutritionVariants — варианты на другом молоке/
// добавке (первый — основной).

export const MENU_ITEMS = [
  {
    "title": "Доппио",
    "section": null,
    "kind": "drink",
    "description": "Кофейное зерно",
    "volumes": [
      {
        "ml": 40,
        "price": 180,
        "nutrition": {
          "calories": 4,
          "protein": 2.6,
          "fat": 2.8,
          "carbs": 0
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Американо",
    "section": null,
    "kind": "drink",
    "description": "Доппио, вода",
    "volumes": [
      {
        "ml": 200,
        "price": 180,
        "nutrition": {
          "calories": 4,
          "protein": 2.6,
          "fat": 2.8,
          "carbs": 0
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Флэт",
    "section": null,
    "kind": "drink",
    "description": "Доппио, молоко 3,2",
    "volumes": [
      {
        "ml": 200,
        "price": 240,
        "nutrition": {
          "calories": 100,
          "protein": 7.7,
          "fat": 7.9,
          "carbs": 7.52
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Латте",
    "section": null,
    "kind": "drink",
    "description": "Кофейное зерно, молоко 3,2",
    "volumes": [
      {
        "ml": 220,
        "price": 210,
        "nutrition": {
          "calories": 123,
          "protein": 8.4,
          "fat": 8.5,
          "carbs": 9.4
        },
        "calculated": false
      },
      {
        "ml": 400,
        "price": 280,
        "nutrition": {
          "calories": 214,
          "protein": 13.8,
          "fat": 14,
          "carbs": 16.45
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Капучино",
    "section": null,
    "kind": "drink",
    "description": "Кофейное зерно, молоко 3,2",
    "volumes": [
      {
        "ml": 200,
        "price": 210,
        "nutrition": {
          "calories": 99,
          "protein": 7.1,
          "fat": 7.2,
          "carbs": 7.52
        },
        "calculated": false
      },
      {
        "ml": 400,
        "price": 280,
        "nutrition": {
          "calories": 214,
          "protein": 13.8,
          "fat": 14,
          "carbs": 16.45
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Раф с сиропом",
    "section": null,
    "kind": "drink",
    "description": "Кофейное зерно, сливки 10 %, молоко 3,2, сироп",
    "volumes": [
      {
        "ml": 400,
        "price": 350,
        "nutrition": {
          "calories": 202.4,
          "protein": 8.44,
          "fat": 16,
          "carbs": 13.32
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Френч пресс",
    "section": null,
    "kind": "drink",
    "description": "Кофейное зерно, вода горячая",
    "volumes": [
      {
        "ml": 300,
        "price": 300,
        "nutrition": {
          "calories": 4.2,
          "protein": 2.73,
          "fat": 2.94,
          "carbs": 0
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Френч пресс декаф",
    "section": null,
    "kind": "drink",
    "description": "Кофейное зерно декаф, вода горячая",
    "volumes": [
      {
        "ml": 300,
        "price": 350,
        "nutrition": {
          "calories": 5.25,
          "protein": 2.52,
          "fat": 2.52,
          "carbs": 1.47
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Аффогато",
    "section": null,
    "kind": "drink",
    "description": "Кофейное зерно, мороженое сливочное, фисташка крошка",
    "volumes": [
      {
        "ml": 180,
        "price": 240,
        "nutrition": {
          "calories": 283,
          "protein": 8.6,
          "fat": 14.05,
          "carbs": 22.55
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Какао",
    "section": null,
    "kind": "drink",
    "description": "Какао порошок, молоко 3,2, сироп (шокобомб)",
    "volumes": [
      {
        "ml": 300,
        "price": 250,
        "nutrition": {
          "calories": 173.7,
          "protein": 7.9,
          "fat": 8.2,
          "carbs": 15.8
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Латте миндаль",
    "section": "Кофе",
    "kind": "drink",
    "description": "Кофейное зерно, молоко миндальное, урбеч миндальный",
    "volumes": [
      {
        "ml": 400,
        "price": 390,
        "nutrition": {
          "calories": 205.8,
          "protein": 7.8,
          "fat": 17.6,
          "carbs": 12.4
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Раф кедровый",
    "section": "Кофе",
    "kind": "drink",
    "tag": "ТОП",
    "description": "Молоко 3,2, урбеч кедровый, кофейное зерно",
    "volumes": [
      {
        "ml": 400,
        "price": 520,
        "nutrition": {
          "calories": 258.8,
          "protein": 13.74,
          "fat": 21.2,
          "carbs": 13.46
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Латте кокос-арахис",
    "section": "Кофе",
    "kind": "drink",
    "description": "Кофейное зерно, молоко кокс, паста арахисовая",
    "volumes": [
      {
        "ml": 400,
        "price": 370,
        "nutrition": {
          "calories": 198.8,
          "protein": 9.4,
          "fat": 16.4,
          "carbs": 11.4
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Гранатовый кофе",
    "section": "Кофе",
    "kind": "drink",
    "tag": "ТОП",
    "description": "Кофейное зерно, сок гранат, вода, основа гранат-рислинг",
    "volumes": [
      {
        "ml": 400,
        "price": 310,
        "nutrition": {
          "calories": 149,
          "protein": 2.6,
          "fat": 2.8,
          "carbs": 27.1
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Шмель (Бамбл)",
    "section": "Кофе",
    "kind": "drink",
    "description": "Кофейное зерно, апелсин фреш, сироп, лед",
    "volumes": [
      {
        "ml": 400,
        "price": 350,
        "nutrition": {
          "calories": 113,
          "protein": 4.4,
          "fat": 3.2,
          "carbs": 21.9
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Эспрессо-тоник",
    "section": "Кофе",
    "kind": "drink",
    "description": "Кофейное зерно, тоник эвервес, лимон долька, лед",
    "volumes": [
      {
        "ml": 400,
        "price": 260,
        "nutrition": {
          "calories": 43.4,
          "protein": 2.7,
          "fat": 2.8,
          "carbs": 9.08
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Айс-латте",
    "section": "Кофе",
    "kind": "drink",
    "description": "Кофейное зерно, молоко 3,2, лед, сироп",
    "volumes": [
      {
        "ml": 400,
        "price": 280,
        "nutrition": {
          "calories": 147,
          "protein": 9,
          "fat": 9.2,
          "carbs": 15.1
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Американо юдзу",
    "section": "Кофе",
    "kind": "drink",
    "description": "Кофейное зерно, пюре юдзу монин, газированная вода, лимон кружок, лед",
    "volumes": [
      {
        "ml": 400,
        "price": 250,
        "nutrition": {
          "calories": 95.2,
          "protein": 2.68,
          "fat": 2.8,
          "carbs": 22.44
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Матча Латте",
    "section": "Не кофе",
    "kind": "drink",
    "nutritionVariants": [
      {
        "label": "на кокосовом молоке",
        "nutrition": {
          "calories": 123.48,
          "protein": 2.41,
          "fat": 6.11,
          "carbs": 14.91
        }
      },
      {
        "label": "на миндальном молоке",
        "nutrition": {
          "calories": 126.48,
          "protein": 2.71,
          "fat": 6.11,
          "carbs": 15.51
        }
      },
      {
        "label": "на безлактозном молоке",
        "nutrition": {
          "calories": 147.48,
          "protein": 9.61,
          "fat": 5.51,
          "carbs": 14.91
        }
      }
    ],
    "volumes": [
      {
        "ml": 200,
        "price": 250,
        "nutrition": {
          "calories": 61.7,
          "protein": 1.2,
          "fat": 3.1,
          "carbs": 7.5
        },
        "calculated": true
      },
      {
        "ml": 400,
        "price": 340,
        "nutrition": {
          "calories": 123.48,
          "protein": 2.41,
          "fat": 6.11,
          "carbs": 14.91
        },
        "calculated": false
      }
    ],
    "description": "Мачта порошок, матча порошок. Молоко: кокосовое, миндальное или безлактозное."
  },
  {
    "title": "Матча Сблеском",
    "section": "Не кофе",
    "kind": "drink",
    "nutritionVariants": [
      {
        "label": "на кокосовом молоке",
        "nutrition": {
          "calories": 118,
          "protein": 1.82,
          "fat": 6.02,
          "carbs": 14.45
        }
      },
      {
        "label": "на миндальном молоке",
        "nutrition": {
          "calories": 121,
          "protein": 2.12,
          "fat": 6.02,
          "carbs": 15.05
        }
      },
      {
        "label": "на безлактозном молоке",
        "nutrition": {
          "calories": 142,
          "protein": 9.02,
          "fat": 5.42,
          "carbs": 14.45
        }
      }
    ],
    "volumes": [
      {
        "ml": 200,
        "price": 250,
        "nutrition": {
          "calories": 59,
          "protein": 0.9,
          "fat": 3,
          "carbs": 7.2
        },
        "calculated": true
      },
      {
        "ml": 400,
        "price": 340,
        "nutrition": {
          "calories": 118,
          "protein": 1.82,
          "fat": 6.02,
          "carbs": 14.45
        },
        "calculated": false
      }
    ],
    "description": "Порошок матча синяя. Молоко: кокосовое, миндальное или безлактозное."
  },
  {
    "title": "Убе Латте",
    "section": "Не кофе",
    "kind": "drink",
    "nutritionVariants": [
      {
        "label": "на кокосовом молоке",
        "nutrition": {
          "calories": 133,
          "protein": 1.84,
          "fat": 6.34,
          "carbs": 17.3
        }
      },
      {
        "label": "на миндальном молоке",
        "nutrition": {
          "calories": 136,
          "protein": 2.14,
          "fat": 6.34,
          "carbs": 17.9
        }
      },
      {
        "label": "на безлактозном молоке",
        "nutrition": {
          "calories": 157,
          "protein": 9.04,
          "fat": 5.74,
          "carbs": 17.3
        }
      }
    ],
    "volumes": [
      {
        "ml": 200,
        "price": 250,
        "nutrition": {
          "calories": 66.5,
          "protein": 0.9,
          "fat": 3.2,
          "carbs": 8.7
        },
        "calculated": true
      },
      {
        "ml": 400,
        "price": 340,
        "nutrition": {
          "calories": 133,
          "protein": 1.84,
          "fat": 6.34,
          "carbs": 17.3
        },
        "calculated": false
      }
    ],
    "description": "Порошок убе, порошок таро. Молоко: кокосовое, миндальное или безлактозное."
  },
  {
    "title": "Фисташковый матча латте",
    "section": "Не кофе",
    "kind": "drink",
    "description": "Матча порошок, молоко 3,2, урбеч фисташковый, сироп",
    "nutritionVariants": [
      {
        "label": "на молоке 3,2%",
        "nutrition": {
          "calories": 256.92,
          "protein": 11.12,
          "fat": 15.56,
          "carbs": 20.18
        }
      },
      {
        "label": "на безлактозном молоке",
        "nutrition": {
          "calories": 230.92,
          "protein": 10.72,
          "fat": 12.8,
          "carbs": 20.18
        }
      }
    ],
    "volumes": [
      {
        "ml": 300,
        "price": 390,
        "nutrition": {
          "calories": 256.92,
          "protein": 11.12,
          "fat": 15.56,
          "carbs": 20.18
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Какао «Горячая» вишня",
    "section": "Не кофе",
    "kind": "drink",
    "description": "Какао порошок, молоко 3,2/безлактозное, перец чили, сироп",
    "nutritionVariants": [
      {
        "label": "молоко 3,2",
        "nutrition": {
          "calories": 204.8,
          "protein": 9.78,
          "fat": 10.12,
          "carbs": 17.18
        }
      },
      {
        "label": "молоко безлактозное",
        "nutrition": {
          "calories": 172.3,
          "protein": 9.28,
          "fat": 6.62,
          "carbs": 17.18
        }
      }
    ],
    "volumes": [
      {
        "ml": 300,
        "price": 300,
        "nutrition": {
          "calories": 204.8,
          "protein": 9.78,
          "fat": 10.12,
          "carbs": 17.18
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Какао Шмель",
    "section": "Не кофе",
    "kind": "drink",
    "description": "Какао порошок, апельсин фреш, лед, сироп",
    "volumes": [
      {
        "ml": 400,
        "price": 350,
        "nutrition": {
          "calories": 147.7,
          "protein": 3.31,
          "fat": 2.23,
          "carbs": 28.6
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Матча тоник",
    "section": "Не кофе",
    "kind": "drink",
    "description": "Матча порошок, тоник эвервес, лед",
    "volumes": [
      {
        "ml": 350,
        "price": 260,
        "nutrition": {
          "calories": 42.48,
          "protein": 0.61,
          "fat": 0.11,
          "carbs": 9.58
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Матча Фисташковый пломбир",
    "section": "Не кофе",
    "kind": "drink",
    "description": "Матча порошок, молоко 3,2, лед, сливки 10 %, сироп (фисташка)",
    "volumes": [
      {
        "ml": 350,
        "price": 450,
        "nutrition": {
          "calories": 179.48,
          "protein": 6.66,
          "fat": 9.9,
          "carbs": 15.46
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Матча мятный пломбир",
    "section": "Не кофе",
    "kind": "drink",
    "description": "Порошок матча синяя, молоко 3,2, лед, сливки 10%, сироп (мята белая)",
    "volumes": [
      {
        "ml": 350,
        "price": 450,
        "nutrition": {
          "calories": 174,
          "protein": 6.06,
          "fat": 9.8,
          "carbs": 15
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Убе Ежевичный пломбир",
    "section": "Не кофе",
    "kind": "drink",
    "description": "Порошок таро, порошок убе, молоко 3,2, лед, сливки 10 %, сироп (ежевика)",
    "volumes": [
      {
        "ml": 350,
        "price": 450,
        "nutrition": {
          "calories": 189,
          "protein": 6.06,
          "fat": 10.1,
          "carbs": 18
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Апельсиновый пунш",
    "section": "Согревающие",
    "kind": "drink",
    "description": "Апельсин фреш, перец апельсиновый, имбирь св (фреш), сироп",
    "volumes": [
      {
        "ml": 350,
        "price": 360,
        "nutrition": {
          "calories": 161.6,
          "protein": 2.63,
          "fat": 0.66,
          "carbs": 33.88
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Глинтвейн грейпфрут",
    "section": "Согревающие",
    "kind": "drink",
    "description": "Апельсин фреш, основа глинтвейн, вода горячая",
    "volumes": [
      {
        "ml": 300,
        "price": 290,
        "nutrition": {
          "calories": 131.5,
          "protein": 1.87,
          "fat": 0.46,
          "carbs": 28.75
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Сибирский чай с корицей",
    "section": "Согревающие",
    "kind": "drink",
    "description": "Чай черный, молоко 3,2/безлактозное, сироп (тайга), корица молотая, вода горяая",
    "nutritionVariants": [
      {
        "label": "молоко 3,2",
        "nutrition": {
          "calories": 144,
          "protein": 6.4,
          "fat": 6.4,
          "carbs": 15.2
        }
      },
      {
        "label": "молоко безлактозное",
        "nutrition": {
          "calories": 118,
          "protein": 6,
          "fat": 3.6,
          "carbs": 15.2
        }
      }
    ],
    "volumes": [
      {
        "ml": 300,
        "price": 280,
        "nutrition": {
          "calories": 144,
          "protein": 6.4,
          "fat": 6.4,
          "carbs": 15.2
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Имбирный юдзу",
    "section": "Согревающие",
    "kind": "drink",
    "description": "Вода горяая, основа юдзу, имбирь (фреш), лайм (кружок)",
    "volumes": [
      {
        "ml": 250,
        "price": 240,
        "nutrition": {
          "calories": 118.2,
          "protein": 0.73,
          "fat": 0.26,
          "carbs": 28.24
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Шиповник с апельсином",
    "section": "Согревающие",
    "kind": "drink",
    "description": "Вода горячая, шиповник сублимированный, сироп шиповника, апельсин (кружок 2 шт)",
    "volumes": [
      {
        "ml": 250,
        "price": 210,
        "nutrition": {
          "calories": 98.8,
          "protein": 0.86,
          "fat": 0.08,
          "carbs": 19.68
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Чайник Малина-мята",
    "section": "Чайники",
    "kind": "drink",
    "description": "Малина св/м, сахар, чай черный, вода горячая, мята свежая",
    "volumes": [
      {
        "ml": 500,
        "price": 320,
        "nutrition": {
          "calories": 102,
          "protein": 0.8,
          "fat": 0.3,
          "carbs": 23.4
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Чайник Малина-розмарин",
    "section": "Чайники",
    "kind": "drink",
    "description": "Малина св/м, сахар, чай черный, вода горячая, розмарин",
    "volumes": [
      {
        "ml": 500,
        "price": 320,
        "nutrition": {
          "calories": 102,
          "protein": 0.8,
          "fat": 0.3,
          "carbs": 23.4
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Чайник Облепиха-имбирь",
    "section": "Чайники",
    "kind": "drink",
    "description": "Облепиха св\\м, имбирь (фреш), мед, чай черный, розмарин, вода горячая",
    "volumes": [
      {
        "ml": 500,
        "price": 320,
        "nutrition": {
          "calories": 107.8,
          "protein": 0.97,
          "fat": 1.18,
          "carbs": 23.02
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Чайник Витамин от управляющей",
    "section": "Чайники",
    "kind": "drink",
    "description": "Чай черный (чабрец), лимон (долька), мед/сироп, имбирь (фреш), вода горячая",
    "nutritionVariants": [
      {
        "label": "мед",
        "nutrition": {
          "calories": 140.8,
          "protein": 1.31,
          "fat": 0.32,
          "carbs": 31
        }
      },
      {
        "label": "сироп",
        "nutrition": {
          "calories": 89.6,
          "protein": 1.07,
          "fat": 0.32,
          "carbs": 18.3
        }
      }
    ],
    "volumes": [
      {
        "ml": 500,
        "price": 280,
        "nutrition": {
          "calories": 140.8,
          "protein": 1.31,
          "fat": 0.32,
          "carbs": 31
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Ройбош Шишка-гранат",
    "section": "Чайники",
    "kind": "drink",
    "description": "Ройбош, основа слоумо (шишка-гранат), вода горячая",
    "volumes": [
      {
        "ml": 500,
        "price": 280,
        "nutrition": {
          "calories": 145,
          "protein": 0,
          "fat": 0,
          "carbs": 35
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Банановый какао",
    "section": "Освежающие",
    "kind": "drink",
    "description": "Банан, какао порошок, молоко 3,2/ молоко безлактозное, сироп",
    "nutritionVariants": [
      {
        "label": "молоко 3,2",
        "nutrition": {
          "calories": 295,
          "protein": 8.7,
          "fat": 7.8,
          "carbs": 50.1
        }
      },
      {
        "label": "молоко безлактозное",
        "nutrition": {
          "calories": 272,
          "protein": 8.3,
          "fat": 5.3,
          "carbs": 50.1
        }
      }
    ],
    "volumes": [
      {
        "ml": 300,
        "price": 340,
        "nutrition": {
          "calories": 295,
          "protein": 8.7,
          "fat": 7.8,
          "carbs": 50.1
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Холодный американо",
    "section": "Освежающие",
    "kind": "drink",
    "description": "Кофейное зерно, вода холодная, лед",
    "volumes": [
      {
        "ml": 300,
        "price": 180,
        "nutrition": {
          "calories": 4,
          "protein": 2.6,
          "fat": 2.8,
          "carbs": 0
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Американо малина-кардамон",
    "section": "Освежающие",
    "kind": "drink",
    "description": "Кофейное зерно, вода холодная, основа мс малина-кардамон, лед",
    "volumes": [
      {
        "ml": 300,
        "price": 220,
        "nutrition": {
          "calories": 52,
          "protein": 2.6,
          "fat": 2.8,
          "carbs": 12
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Эспрессо-тоник на игристом (цветочный/вишневый)",
    "section": "Освежающие",
    "kind": "drink",
    "description": "Кофейное зерно, игристое дринксом, лед, сироп",
    "volumes": [
      {
        "ml": 300,
        "price": 350,
        "nutrition": {
          "calories": 74,
          "protein": 2.6,
          "fat": 2.8,
          "carbs": 17.38
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Протеиновый коктейль",
    "section": "Освежающие",
    "kind": "drink",
    "description": "Вода, банан, порошок протеин",
    "volumes": [
      {
        "ml": 350,
        "price": 360,
        "nutrition": {
          "calories": 237.6,
          "protein": 25.54,
          "fat": 1.42,
          "carbs": 33.92
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Пинк-дринк",
    "section": "Освежающие",
    "kind": "drink",
    "description": "Молоко кокосовое/миндальное/безлактозное, сок земляничный, лед, клубника св/м",
    "nutritionVariants": [
      {
        "label": "молоко кокосовое",
        "nutrition": {
          "calories": 128,
          "protein": 1.6,
          "fat": 4.2,
          "carbs": 21.3
        }
      },
      {
        "label": "молоко миндальное",
        "nutrition": {
          "calories": 130,
          "protein": 1.8,
          "fat": 4.2,
          "carbs": 21.7
        }
      },
      {
        "label": "молоко безлактозное",
        "nutrition": {
          "calories": 144,
          "protein": 6.4,
          "fat": 3.8,
          "carbs": 21.3
        }
      }
    ],
    "volumes": [
      {
        "ml": 450,
        "price": 290,
        "nutrition": {
          "calories": 128,
          "protein": 1.6,
          "fat": 4.2,
          "carbs": 21.3
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Пинк-дринк матча",
    "section": "Освежающие",
    "kind": "drink",
    "description": "Молоко кокосовое/миндальное/безлактозное, сок земляничный, лед, клубника св/м, матча порошок",
    "nutritionVariants": [
      {
        "label": "молоко кокосовое",
        "nutrition": {
          "calories": 108.74,
          "protein": 1.48,
          "fat": 3.22,
          "carbs": 18.82
        }
      },
      {
        "label": "молоко миндальное",
        "nutrition": {
          "calories": 110.24,
          "protein": 1.68,
          "fat": 3.22,
          "carbs": 19.12
        }
      },
      {
        "label": "молоко безлактозное",
        "nutrition": {
          "calories": 120.74,
          "protein": 5.08,
          "fat": 2.92,
          "carbs": 18.82
        }
      }
    ],
    "volumes": [
      {
        "ml": 450,
        "price": 340,
        "nutrition": {
          "calories": 108.74,
          "protein": 1.48,
          "fat": 3.22,
          "carbs": 18.82
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Матча жасмин",
    "section": "Освежающие",
    "kind": "drink",
    "description": "Основа лью жасмин-бузина, газированная вода, сливки кокос, матча порошок, сироп (бузина), лед",
    "volumes": [
      {
        "ml": 350,
        "price": 340,
        "nutrition": {
          "calories": 107.3,
          "protein": 0.7,
          "fat": 7.7,
          "carbs": 8.78
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Земляничный убе",
    "section": "Освежающие",
    "kind": "drink",
    "description": "Основа мс (земляника+тонка), газированная вода, кокосовые сливки, сироп сахарный, порошок таро, порошок убе, лед",
    "volumes": [
      {
        "ml": 350,
        "price": 340,
        "nutrition": {
          "calories": 108,
          "protein": 0.3,
          "fat": 8,
          "carbs": 8.4
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Лимонад Грушевое вино",
    "section": "Освежающие",
    "kind": "drink",
    "description": "Основа мс (груша_жасмин), газированая вода, шиммер (золото), лед",
    "volumes": [
      {
        "ml": 300,
        "price": 260,
        "nutrition": {
          "calories": 40,
          "protein": 0,
          "fat": 0,
          "carbs": 10
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Лимонад юдзу",
    "section": "Освежающие",
    "kind": "drink",
    "tag": "ТОП",
    "description": "Основа юдзу, газированная вода, лед",
    "volumes": [
      {
        "ml": 350,
        "price": 260,
        "nutrition": {
          "calories": 60.8,
          "protein": 0.08,
          "fat": 0,
          "carbs": 14.96
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Лимонад земляничный",
    "section": "Освежающие",
    "kind": "drink",
    "description": "Основа мс, газированная вода, шиммер (золото), лед, клубника св/м",
    "volumes": [
      {
        "ml": 350,
        "price": 260,
        "nutrition": {
          "calories": 44.5,
          "protein": 0.12,
          "fat": 0.06,
          "carbs": 10.87
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Лимонад Дикие ягоды",
    "section": "Освежающие",
    "kind": "drink",
    "description": "Основа мс, газированная вода, лед, ежевика (3 ягоды)",
    "volumes": [
      {
        "ml": 350,
        "price": 260,
        "nutrition": {
          "calories": 59.2,
          "protein": 1.8,
          "fat": 0.6,
          "carbs": 9.8
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Лимонад Расцветай",
    "section": "Освежающие",
    "kind": "drink",
    "description": "Игристое безалко, газированая вода, стироп. (бузина), лимон (сок), лед, клубника св/м, шиммер (серебро)",
    "volumes": [
      {
        "ml": 350,
        "price": 320,
        "nutrition": {
          "calories": 87.4,
          "protein": 0.34,
          "fat": 0.1,
          "carbs": 20.26
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Лимонад Розовый лимон",
    "section": "Освежающие",
    "kind": "drink",
    "description": "Игристое дринксом, сироп, лайм (сок), бутоны роз чай, лед",
    "volumes": [
      {
        "ml": 300,
        "price": 310,
        "nutrition": {
          "calories": 96.5,
          "protein": 0.35,
          "fat": 0.1,
          "carbs": 25.45
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Мороженое Миндаль-лайм",
    "section": "Мороженое",
    "kind": "drink",
    "description": "Мороженое сливочное, лайм (фреш 1/2), миндальны елепестки",
    "volumes": [
      {
        "ml": 130,
        "price": 300,
        "nutrition": {
          "calories": 272.5,
          "protein": 7.19,
          "fat": 14.94,
          "carbs": 25.74
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Мороженое Гранат-грецкий орех",
    "section": "Мороженое",
    "kind": "drink",
    "description": "Мороженое сливочное, соус гранат, грецкий орех",
    "volumes": [
      {
        "ml": 135,
        "price": 300,
        "nutrition": {
          "calories": 354.5,
          "protein": 6.6,
          "fat": 21,
          "carbs": 27.7
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Мороженое Малина-фисташка",
    "section": "Мороженое",
    "kind": "drink",
    "description": "Мороженое сливочное, урбеч фисташка, малина св/м, фисташка крошка",
    "volumes": [
      {
        "ml": 150,
        "price": 310,
        "nutrition": {
          "calories": 292.25,
          "protein": 9.35,
          "fat": 18.25,
          "carbs": 23.65
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Аффогато с фисташкой",
    "section": "Мороженое",
    "kind": "drink",
    "description": "Кофейное зерно, мороженое сливочное, фисташка крошка",
    "volumes": [
      {
        "ml": 180,
        "price": 320,
        "nutrition": {
          "calories": 283,
          "protein": 8.6,
          "fat": 14.05,
          "carbs": 22.55
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Лимонад \"Расцветай!\" от Сблеском",
    "section": "Спэшл",
    "kind": "drink",
    "description": "Игристое безалко, газированая вода, стироп. (бузина), лимон (сок), лед, клубника св/м, шиммер (серебро)",
    "volumes": [
      {
        "ml": 350,
        "price": 320,
        "nutrition": {
          "calories": 87.4,
          "protein": 0.34,
          "fat": 0.1,
          "carbs": 20.26
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Шмель грейпфрут-малина от Ульяны",
    "section": "Спэшл",
    "kind": "drink",
    "description": "Кофейное зерно, фреш грейпфрут, малина св.м, сахар, лед",
    "volumes": [
      {
        "ml": 400,
        "price": 420,
        "nutrition": {
          "calories": 113,
          "protein": 4.4,
          "fat": 3.2,
          "carbs": 21.9
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Эспрессо-тоник ПалоСанто от Валентины",
    "section": "Спэшл",
    "kind": "drink",
    "description": "Кофейное зерно, тоник эвервес, основа (пало санто), лед",
    "volumes": [
      {
        "ml": 400,
        "price": 350,
        "nutrition": {
          "calories": 43.4,
          "protein": 2.7,
          "fat": 2.8,
          "carbs": 9.1
        },
        "calculated": false
      }
    ]
  },
  {
    "title": "Сытные пироги",
    "kind": "food",
    "description": "Сдобное тесто, варианты начинки: Капуста-куриный фарш/картофель-бекон/сыр-шпинат/сыр-грибы",
    "nutrition": {
      "calories": 304,
      "protein": 14,
      "fat": 8,
      "carbs": 45
    },
    "price": 390
  },
  {
    "title": "Гранола с йогуртом",
    "kind": "food",
    "description": "Гранола: кедровый орех-клюква/семена конопли-чиа/ детская с воздушными хлопьями; термостатный йогурт, молоко доп: банан, тертый какао",
    "nutrition": {
      "calories": 398,
      "protein": 11,
      "fat": 15,
      "carbs": 47
    },
    "price": 250
  },
  {
    "title": "Бутерброд с икрой",
    "kind": "food",
    "description": "Икра лососевая - 50 гр, багет, масло сливочное, лимон",
    "nutrition": {
      "calories": 380,
      "protein": 20,
      "fat": 23,
      "carbs": 11
    },
    "price": 990
  },
  {
    "title": "Сэндвичи с форелью",
    "kind": "food",
    "description": "Безглютеновые вафли на свекольномпюре, сметанный пряный соус, форель слабой соли, свежий салат и огурец",
    "nutrition": {
      "calories": 338,
      "protein": 13,
      "fat": 19,
      "carbs": 38
    },
    "price": 550
  },
  {
    "title": "Сэндвичи с курицей",
    "kind": "food",
    "description": "Безглютеновые вафли на тыквенном пюре, пряный соус цезарь, курица су-вид, свежий салат и томат",
    "nutrition": {
      "calories": 328,
      "protein": 15,
      "fat": 19,
      "carbs": 38
    },
    "price": 420
  },
  {
    "title": "Боул с курицей",
    "kind": "food",
    "description": "Рис с куриным филе, овощами, эдамаме и кунжутом под соусом терияки.",
    "nutrition": {
      "calories": 648,
      "protein": 25.1,
      "fat": 21.6,
      "carbs": 58.6
    },
    "weight": "270 гр",
    "price": 470
  },
  {
    "title": "Боул с форелью",
    "kind": "food",
    "description": "Рис со слабосолёной форелью, свежими овощами под соусом терияки",
    "nutrition": {
      "calories": 526.5,
      "protein": 18.9,
      "fat": 37.8,
      "carbs": 37.8
    },
    "weight": "250 гр",
    "price": 590
  },
  {
    "title": "Цезарь с курицей",
    "kind": "food",
    "description": "Куриное филе, хрустящие листья салата, томаты и пармезан под классическим соусом «Цезарь».",
    "nutrition": {
      "calories": 229,
      "protein": 12.2,
      "fat": 12.9,
      "carbs": 8
    },
    "weight": "170 гр",
    "price": 410
  },
  {
    "title": "Цезарь с лососем",
    "kind": "food",
    "description": "Слабосоленый лосось, хрустящие листья салата, черри и пармезан под соусом Ворчестер.",
    "nutrition": {
      "calories": 260,
      "protein": 14,
      "fat": 18.2,
      "carbs": 9.9
    },
    "weight": "160 гр",
    "price": 500
  },
  {
    "title": "Роти с курицей и песто",
    "kind": "food",
    "description": "Лепешка роти с куриным филе, моцареллой, томатами и ароматным соусом песто.",
    "nutrition": {
      "calories": 480,
      "protein": 29,
      "fat": 11.2,
      "carbs": 75.6
    },
    "weight": "200 гр",
    "price": 430
  },
  {
    "title": "Роти с ветчиной и сыром",
    "kind": "food",
    "description": "Тонкая лепешка роти с ветчиной, сыром, томатами и нежным соусом.",
    "nutrition": {
      "calories": 770,
      "protein": 26,
      "fat": 23.6,
      "carbs": 70
    },
    "weight": "200 гр",
    "price": 390
  },
  {
    "title": "Греческий",
    "kind": "food",
    "description": "Хрусятщие листья салата, свежие овощи, сыр фета, маслины и оливки с орегано.",
    "nutrition": {
      "calories": 260,
      "protein": 5,
      "fat": 8,
      "carbs": 5.6
    },
    "weight": "160 гр",
    "price": 430
  },
  {
    "title": "Рисовая с шоколадом и орехом",
    "kind": "food",
    "description": "",
    "nutrition": {
      "calories": 391,
      "protein": 7.6,
      "fat": 20,
      "carbs": 44.9
    },
    "weight": "230 гр",
    "price": 200
  },
  {
    "title": "Рисовая с апельсиновым конфитюром",
    "kind": "food",
    "description": "",
    "nutrition": {
      "calories": 276,
      "protein": 5,
      "fat": 7.4,
      "carbs": 46.9
    },
    "weight": "230 гр",
    "price": 200
  },
  {
    "title": "Рисовая с шоколадом и вишней",
    "kind": "food",
    "description": "",
    "nutrition": {
      "calories": 299,
      "protein": 6.4,
      "fat": 10.6,
      "carbs": 44.2
    },
    "weight": "230 гр",
    "price": 200
  },
  {
    "title": "Овсяная с конфитюром апельсин-ваниль",
    "kind": "food",
    "description": "",
    "nutrition": {
      "calories": 287,
      "protein": 7.6,
      "fat": 10.1,
      "carbs": 41.4
    },
    "weight": "230 гр",
    "price": 200
  }
];
