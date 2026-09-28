# How the Pune Power Brain Works

## 1. The problem

Sometimes Pune needs more electricity than is available. Then some places must be switched
off for a while. This is called **load shedding**.

The simulator makes this decision **automatically** with a circuit built from basic digital
electronics blocks. There are three rules:
1. Switch off as few places as possible, in a fixed order.
2. **Never** switch off essential public services, emergency facilities or critical infrastructure.
3. Act **before** the overload, using a prediction of demand 30 minutes ahead.

Place names are real. MW numbers are examples for learning, not real MSEDCL data.

## 2. The city: regions, areas and places

Pune is modelled as **4 regions**, **29 areas** and **82 named places**.
**25 places are essential** and locked ON. The other **57 can be switched off**.

| Region | Areas |
|---|---|
| Central Pune (core city) | Kasba Peth, Shaniwar Peth, Budhwar Peth, Raviwar Peth, Deccan Gymkhana, Camp (MG Road), Swargate, Laxmi Road, Pune Station |
| Western Pune | Aundh, Baner, Balewadi, Kothrud, Pashan, Hinjawadi |
| Eastern and North-Eastern Pune | Koregaon Park, Viman Nagar, Kalyani Nagar, Wadgaon Sheri, Hadapsar, Magarpatta City, Amanora Park, Lohegaon |
| Northern and Pimpri-Chinchwad | Bhosari, Chakan, Pimpri-Chinchwad, Wakad, Pimple Saudagar, Sangvi |

Examples of places:
- **Essential (never off):** Sassoon General Hospital, Ruby Hall Clinic, Jehangir Hospital, KEM Hospital,
  Deenanath Mangeshkar Hospital, YCM Hospital, Pune Railway Station, Pune Airport, Swargate bus depot,
  Parvati water works, Nigdi water works, fire stations, police, telecom exchange.
- **Can be switched off:** Shaniwar Wada light show, Dagdusheth temple lighting, Laxmi Road market,
  Phoenix Marketcity, Kothrud housing societies, Hinjawadi IT Park Phase 1, 2 and 3,
  Magarpatta Cybercity, Chakan MIDC auto plants, Bhosari MIDC plants, and more.

## 3. Switch-off order

Each place that can be switched off gets an order number from #0 to #56. #0 goes off first.

| Order numbers | Kind of place |
|---|---|
| #0 to #19 | Shops, malls and landmark lighting |
| #20 to #45 | Housing societies and homes |
| #46 to #51 | IT parks and offices |
| #52 to #56 | Factories |

Inside each group, the order takes one place from each region in turn
(Central, Western, Eastern, Northern, then Central again...). This spreads the power cuts
across the whole city instead of blacking out one area.

## 4. What happens every second

The dashboard uses your computer's **real clock**, shown in Pune time (IST). Once every second:

1. **Meter reading.** Each of the 82 places gets its demand right now (in MW).
2. **Prediction.** The model predicts each place's demand **30 minutes from now**.
3. **Circuit.** The circuit compares the predicted total with the electricity available and
   switches places off (or back on) so the city will fit when that moment arrives.
4. **Screen.** The 3D brain, alerts and numbers update.

### Where the meter readings come from (honest note)

There is no public, live, per-place power feed for Pune. So each reading is **simulated** from:

reading = peak MW × daily pattern (by hour) × weekday effect × slow day-to-day swing × small wiggle

- **Daily pattern:** homes peak in the evening, IT parks in office hours, shops in the evening,
  factories run all day, essential services stay steady.
- **Weekday effect:** IT parks drop at weekends, malls and landmarks rise.
- It depends only on the time, so the same moment always gives the same reading.

## 5. The 30-minute prediction (the ML part)

The model is **ridge regression** (linear regression with a small penalty), one per kind of place
(shops, landmark, homes, IT, factory, essential). For a place at time t it predicts demand at
t + 30 min from 7 inputs:

| Input | Meaning |
|---|---|
| 1 | constant (bias) |
| now | reading now |
| 30 min ago | reading 30 minutes ago (is it rising or falling?) |
| yesterday | reading yesterday at the target time |
| sin, cos | time of day at the target time (so 23:59 is next to 00:00) |
| weekend | 1 on Saturday or Sunday |

All readings are divided by the place's peak, so one model fits every place of that kind.

**Training** (`python -m backend.ml.train`): 60 days of simulated history, one sample every 15
minutes. The first 50 days train the model and the last 10 days test it.

| Kind | Test error (average) |
|---|---|
| Shops and malls | 2.25% |
| Landmark lighting | 3.17% |
| Homes | 2.34% |
| IT parks | 3.25% |
| Factories | 2.19% |
| Essential | 1.71% |

So the prediction is close (about 2 to 3% off on average), but no forecast is exact.

### MSEDCL Go-Live Town Reports

These are monthly PDF reports per town (D1 to D7: AT&C loss, new connections, complaints,
high-loss feeders, reliability, feeder communication, online collection). They have **no hourly
or per-place load**, so they cannot train a 30-minute forecast. The project includes a downloader
(`python -m backend.pipeline.fetch_msedcl`) that saves the PDFs and pulls out the Pune rows, which
the dashboard then shows as town-level context.

## 6. The circuit (digital electronics)

| Block | What it does |
|---|---|
| **Clock** | Real time, once per second. Starts each round. |
| **Comparator** | A = predicted load of places that are ON, B = electricity available. OVER = 1 when A > B. SPARE = 1 when A + next place ≤ B. |
| **Up/down counter** | 6-bit register L (0 to 57) = how many places are off. OVER → count up. SPARE → count down. Otherwise hold. It keeps its value from one second to the next. |
| **Decoder** | Place #k is ON when k ≥ L (a thermometer decoder). |
| **Essential lock** | Essential places: ON = 1 OR anything = 1. Always ON. |

Example: L = 6 (binary 000110) → places #0 to #5 are off, #6 to #56 are on, all 25 essential places on.

Within one second the counter can tick several times until the comparator is satisfied.
The dashboard shows each tick in "The circuit, this second".

Because the circuit uses the **predicted** demand, it starts switching off shops and lights
a little before the evening peak, instead of after the grid is already overloaded.

## 7. The 3D power brain

- **Shape:** a brain made of a faint wireframe mesh (cerebrum, cerebellum and brain stem). The mesh
  is only for shape.
- **Bright nodes are the grid:** grid in-feed at the brain stem, 4 substations (one per region),
  29 areas and 82 places.
- **Links are the power lines:** in-feed → substation → area → place. The link colour shows
  the state of the place at its end.

| Colour | Meaning |
|---|---|
| Blue | Steady |
| Peach | Rising |
| Red, glowing and pulsing | Surge: demand will rise 8% or more in 30 minutes |
| Green | Essential, locked ON |
| Red ring | Switched off |

Drag to turn the brain. Tap a node to see its demand now and in 30 minutes, with a small chart of
the last 2 hours and the predicted next 30 minutes. The background is transparent, so it matches
light mode and dark mode.

## 8. Viva questions

**Why predict 30 minutes ahead?** So places can be switched off before the overload, not after.

**Why is the counter 6 bits?** There are 57 places that can be switched off. 6 bits count 0 to 63.

**What stops a hospital from being switched off?** Its relay is tied to logic 1 (an OR gate with 1).
No counter value can turn it off.

**Why not use the MSEDCL reports to train the model?** They are monthly town totals. A 30-minute
forecast needs readings every few minutes for each place.

**Is the prediction exact?** No. On test data it is about 2 to 3% off on average. It is trained
on simulated readings, so it shows the method, not real Pune demand.

**What is SPARE for?** It turns places back on one at a time, only when there is room for the next one,
so the lights do not flicker on and off.
