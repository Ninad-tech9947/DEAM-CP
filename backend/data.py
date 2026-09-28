"""Pune city: grid -> 4 substations (one per region) -> areas -> named places (loads).

Every place is either
  * essential - hospitals, water, fire, police, telecom, transport. Always ON.
  * sheddable - can be switched off. "rank" is the order: rank 0 is switched off first.

Switch-off order (by kind), spread across the 4 regions in turn:
  1. shops, malls and landmark lighting   2. housing societies and homes
  3. IT parks and offices                 4. factories

Place names are used for illustration. MW figures are example numbers for learning,
not real MSEDCL data.
"""

# Fraction of a place's peak demand at each hour 00..23.
PROFILES = {
    "shops":     [.35, .33, .32, .32, .33, .36, .45, .60, .75, .88, .95, .98, 1.00, .99, .98, .97, .96, .95, .93, .88, .78, .62, .48, .40],
    "landmark":  [.30, .25, .25, .25, .25, .30, .40, .45, .50, .55, .60, .60, .60, .60, .60, .65, .70, .85, 1.00, 1.00, 1.00, .95, .70, .45],
    "homes":     [.50, .46, .44, .43, .45, .52, .66, .78, .80, .72, .66, .64, .64, .63, .62, .64, .70, .80, .92, 1.00, .99, .92, .78, .62],
    "it":        [.58, .56, .55, .55, .56, .58, .64, .76, .90, .98, 1.00, 1.00, .98, .99, 1.00, .99, .96, .90, .82, .74, .68, .64, .62, .60],
    "factory":   [.80, .80, .79, .79, .80, .82, .88, .95, .98, 1.00, 1.00, .98, .94, .98, 1.00, .99, .96, .92, .88, .86, .84, .82, .81, .80],
    "essential": [.85, .85, .85, .85, .85, .88, .90, .92, .95, .97, 1.00, 1.00, 1.00, 1.00, 1.00, .98, .97, .96, .95, .94, .92, .90, .88, .86],
}

# Demand multiplier for each weekday, Monday first.
WEEKDAY = {
    "shops":     [1.00, 1.00, 1.00, 1.00, 1.02, 1.10, 1.08],
    "landmark":  [0.95, 0.95, 0.95, 0.95, 1.00, 1.15, 1.20],
    "homes":     [1.00, 1.00, 1.00, 1.00, 1.00, 1.05, 1.08],
    "it":        [1.00, 1.00, 1.00, 1.00, 0.97, 0.55, 0.45],
    "factory":   [1.00, 1.00, 1.00, 1.00, 1.00, 0.92, 0.70],
    "essential": [1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
}

# kind -> (group shown to the user, load profile, switch-off tier; None = essential)
KINDS = {
    "market":    ("Shops and markets", "shops", 1),
    "mall":      ("Malls", "shops", 1),
    "landmark":  ("Landmark lighting", "landmark", 1),
    "homes":     ("Housing societies and homes", "homes", 2),
    "it":        ("IT parks and offices", "it", 3),
    "factory":   ("Factories", "factory", 4),
    "hospital":  ("Hospital", "essential", None),
    "water":     ("Water supply", "essential", None),
    "fire":      ("Fire station", "essential", None),
    "police":    ("Police", "essential", None),
    "telecom":   ("Telecom", "essential", None),
    "transport": ("Transport", "essential", None),
}

# region -> area -> [(place name, kind, peak MW)]
CITY = {
    "Central Pune": {
        "Kasba Peth": [("Kasba Peth wada homes", "homes", 14), ("Kasba water pumping station", "water", 4)],
        "Shaniwar Peth": [("Shaniwar Wada light and sound show", "landmark", 3), ("Shaniwar Peth homes", "homes", 12), ("Central fire station", "fire", 2)],
        "Budhwar Peth": [("Dagdusheth Halwai Ganpati temple lighting", "landmark", 3), ("Tulshibaug market", "market", 6), ("Budhwar Peth homes", "homes", 9)],
        "Raviwar Peth": [("Raviwar Peth wholesale market", "market", 6), ("KEM Hospital", "hospital", 6), ("Raviwar Peth homes", "homes", 10)],
        "Deccan Gymkhana": [("FC Road shops", "market", 8), ("Deccan housing societies", "homes", 14), ("Sahyadri Hospital, Deccan", "hospital", 5)],
        "Camp (MG Road)": [("MG Road shops", "market", 8), ("Camp homes", "homes", 10), ("Police Commissionerate", "police", 3)],
        "Swargate": [("Swargate bus depot", "transport", 5), ("Swargate homes", "homes", 12), ("Parvati water works", "water", 6)],
        "Laxmi Road": [("Laxmi Road cloth and jewellery market", "market", 10), ("Laxmi Road homes", "homes", 8)],
        "Pune Station": [("Pune Railway Station", "transport", 8), ("Sassoon General Hospital", "hospital", 8), ("Ruby Hall Clinic", "hospital", 6), ("Jehangir Hospital", "hospital", 5)],
    },
    "Western Pune": {
        "Aundh": [("Aundh housing societies", "homes", 16), ("Westend Mall", "mall", 6), ("Aundh District Hospital", "hospital", 4)],
        "Baner": [("Baner high-rise societies", "homes", 18), ("Baner Road shops", "market", 6), ("Jupiter Hospital, Baner", "hospital", 5)],
        "Balewadi": [("Balewadi High Street", "market", 7), ("Balewadi societies", "homes", 14), ("Balewadi sports complex lights", "landmark", 4)],
        "Kothrud": [("Kothrud housing societies", "homes", 22), ("Kothrud shops", "market", 7), ("Deenanath Mangeshkar Hospital", "hospital", 7), ("Warje water treatment plant", "water", 6)],
        "Pashan": [("Pashan societies", "homes", 10), ("Pashan research campuses", "it", 5)],
        "Hinjawadi": [("Hinjawadi IT Park Phase 1", "it", 30), ("Hinjawadi IT Park Phase 2", "it", 28), ("Hinjawadi IT Park Phase 3", "it", 24), ("Hinjawadi societies", "homes", 14), ("Hinjawadi telecom exchange", "telecom", 3)],
    },
    "Eastern and North-Eastern Pune": {
        "Koregaon Park": [("Osho International Meditation Resort", "landmark", 3), ("Koregaon Park cafes", "market", 7), ("Koregaon Park bungalows", "homes", 8)],
        "Viman Nagar": [("Phoenix Marketcity", "mall", 8), ("Viman Nagar societies", "homes", 14)],
        "Kalyani Nagar": [("Kalyani Nagar societies", "homes", 10), ("Kalyani Nagar offices", "it", 8)],
        "Wadgaon Sheri": [("Wadgaon Sheri societies", "homes", 12), ("Wadgaon Sheri water pumping", "water", 4)],
        "Hadapsar": [("Hadapsar industrial estate", "factory", 20), ("Hadapsar societies", "homes", 16), ("Noble Hospital, Hadapsar", "hospital", 5)],
        "Magarpatta City": [("Magarpatta Cybercity offices", "it", 22), ("Magarpatta residential towers", "homes", 12), ("Seasons Mall", "mall", 5)],
        "Amanora Park": [("Amanora Mall", "mall", 6), ("Amanora Park towers", "homes", 10)],
        "Lohegaon": [("Pune Airport", "transport", 10), ("Air Force Station, Lohegaon", "police", 5), ("Lohegaon homes", "homes", 8)],
    },
    "Northern and Pimpri-Chinchwad": {
        "Bhosari": [("Bhosari MIDC plants", "factory", 30), ("Bhosari homes", "homes", 10)],
        "Chakan": [("Chakan MIDC auto plants", "factory", 40), ("Chakan warehouses", "factory", 10), ("Chakan fire station", "fire", 2)],
        "Pimpri-Chinchwad": [("Pimpri-Chinchwad auto factories", "factory", 35), ("Pimpri market", "market", 6), ("YCM Hospital", "hospital", 6), ("Aditya Birla Memorial Hospital", "hospital", 6), ("Nigdi water works", "water", 6)],
        "Wakad": [("Wakad societies", "homes", 18), ("Wakad shops", "market", 5)],
        "Pimple Saudagar": [("Pimple Saudagar societies", "homes", 14), ("Kunal Icon Road shops", "market", 4)],
        "Sangvi": [("Sangvi homes", "homes", 10), ("Sangvi police station", "police", 2)],
    },
}

SCALE = 3  # every MW figure above is multiplied by this, to get city-sized numbers

GRID_NAME = "Pune grid in-feed (Lonikand 400 kV)"
# One feeding substation per region. Names are used for illustration.
SUBSTATIONS = [
    "Rastapeth 132 kV substation",
    "Hinjawadi 220 kV substation",
    "Magarpatta 132 kV substation",
    "Chakan 400 kV substation",
]

REGIONS, AREAS, LOADS = [], [], []
for r, (region, areas) in enumerate(CITY.items()):
    REGIONS.append({"id": r, "name": region, "substation": SUBSTATIONS[r]})
    for area, places in areas.items():
        a = len(AREAS)
        AREAS.append({"id": a, "name": area, "region": r})
        for name, kind, peak in places:
            group, profile, tier = KINDS[kind]
            LOADS.append({"id": len(LOADS), "name": name, "kind": kind, "group": group, "profile": profile,
                          "peak": peak * SCALE, "area": a, "region": r, "tier": tier, "essential": tier is None, "rank": None})


def _assign_ranks():
    """Rank sheddable places: tier by tier, taking one place from each region in turn."""
    rank = 0
    for tier in (1, 2, 3, 4):
        queues = [[l for l in LOADS if l["tier"] == tier and l["region"] == r["id"]] for r in REGIONS]
        while any(queues):
            for q in queues:
                if q:
                    q.pop(0)["rank"] = rank
                    rank += 1


_assign_ranks()
N_SHED = sum(1 for l in LOADS if not l["essential"])
L_BITS = N_SHED.bit_length()  # bits needed for the counter L (0..N_SHED)

DEFAULTS = {"supply": 1900, "fault": False}
SURGE_ALERT = 0.08  # warn when a place's demand is predicted to rise 8% or more in 30 minutes
FAULT_LOSS = 400  # MW lost when the grid fault switch is on
