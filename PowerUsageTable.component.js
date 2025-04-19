let getComponent;

(() => {
    "use strict";

    // Utility functions and constants
    const resourceTypes = {
        0: "Mana",
        1: "Rage",
        2: "Focus",
        3: "Energy",
        4: "Combo Points",
        5: "Runes",
        6: "Runic Power",
        7: "Soul Shards",
        8: "Astral Power",
        9: "Holy Power",
        10: "Alternate",
        11: "Maelstrom",
        12: "Chi",
        13: "Insanity",
        14: "Obsolete",
        15: "Obsolete2",
        16: "Arcane Charges",
        17: "Fury",
        18: "Pain",
        19: "Essence",
        20: "Rune Blood (Classic)",
        21: "Rune Frost (Classic)",
        22: "Rune Unholy (Classic)",
        23: "Alternate Quest",
        24: "Alternate Encounter",
        25: "Alternate Mount"
    };

    function getResourceTypeName(resourceType) {
        return resourceTypes[resourceType] || `${resourceType}`;
    }

    // Debugging utility
    class Debugger {
        constructor(debug) {
            this.messages = [];
            this.debug = debug;
        }

        addMessage(key, value) {
            if (!this.debug) return;
            const message = {};
            message[key] = value;
            this.messages.push(message);
        }
    }

    const debug = new Debugger(false);

    // Main component function
    const PowerUsageTable = () => {
        const fights = [];
        const columns = [];
        const rows = [];
        const actorId = eventFilters.actorId;

        // Process each fight
        for (const fight of reportGroup.fights) {
            const fightData = processFight(fight, actorId);
            const fightColumns = fightData.GetColumns();

            fights.push(fightData);
            columns.push(fightColumns);
            rows.push(fightData.GetRows(fightColumns));
        }

        debug.addMessage("Fight Data", fights);

        // Combine columns
        const combinedColumns = combineColumns(columns);
        debug.addMessage("Columns", combinedColumns);

        // Combine rows
        let combinedRows = combineRows(rows);

        // Normalize data if there are multiple fights
        if (fights.length > 1) {
            combinedRows = normalizeData(combinedRows, fights);
        }

        debug.addMessage("Data Rows", combinedRows);

        // Return the table component
        const tableComponent = {
            component: "Table",
            props: {
                columns: {
                    title: {
                        header: "Resource Usage",
                        columns: combinedColumns
                    }
                },
                data: combinedRows
            }
        };

        return debug.debug ? debug.messages : tableComponent;
    };

    // Helper functions
    function processFight(fight, actorId) {
        const fightData = new FightData();
        const events = fight.eventsByCategoryAndDisposition("casts", "friendly");

        for (const event of events) {
            if (event.type === "cast" && (!actorId || event.source?.id === actorId)) {
                fightData.AddCastEvent(event);
            }
        }

        return fightData;
    }

    function combineColumns(columnsArray) {
        let combined = {};
        for (const columns of columnsArray) {
            combined = { ...combined, ...columns };
        }
        return combined;
    }

    function combineRows(rowsArray) {
        const combinedMap = new Map();

        rowsArray.forEach(rows => {
            rows.forEach(row => {
                const key = `${row.actorName}_${row.ability}`;
                if (combinedMap.has(key)) {
                    mergeRows(combinedMap.get(key), row);
                } else {
                    combinedMap.set(key, { ...row });
                }
            });
        });

        return Array.from(combinedMap.values());
    }

    function mergeRows(existingRow, newRow) {
        if (existingRow.actorName === newRow.actorName && existingRow.ability === newRow.ability) {
            for (const key in existingRow) {
                const existingValue = existingRow[key];
                const newValue = newRow[key];

                if (typeof existingValue === "number" && typeof newValue === "number") {
                    existingRow[key] += newValue;
                }
            }
        } else {
            throw new Error("Row objects must have the same actorName and ability");
        }
    }

    function normalizeData(rows, fights) {
        const totalResources = {};

        // Calculate total resources used per player
        for (const fight of fights) {
            for (const playerName in fight.players) {
                const playerResources = fight.players[playerName].getTotalResourcesUsed();
                if (!totalResources[playerName]) {
                    totalResources[playerName] = playerResources;
                } else {
                    for (const resource in playerResources) {
                        totalResources[playerName][resource] =
                            (totalResources[playerName][resource] || 0) + playerResources[resource];
                    }
                }
            }
        }

        // Normalize rows
        for (const row of rows) {
            const playerResources = totalResources[row.actorName];
            for (const key in row) {
                if (key.endsWith("%")) {
                    const resource = key.slice(0, -1);
                    const value = row[resource];
                    if (typeof value === "number" && value !== 0) {
                        row[key] = Math.round((value / playerResources[resource]) * 100);
                    }
                }
            }
        }

        return rows;
    }

    // Classes for processing fight data
    class FightData {
        constructor() {
            this.players = {};
            this.AbilitiesUsed = {};
        }

        AddCastEvent(event) {
            if (event.source && event.source.type !== "Pet" && event.ability) {
                this.AbilitiesUsed[event.ability.name] = event.ability;

                if (!this.players[event.source.name]) {
                    this.players[event.source.name] = new PlayerData();
                }

                this.players[event.source.name].AddCastEvent(event);
            }
        }

        GetColumns() {
            const columns = {
                actorName: { header: "Player Name", textAlign: "center" },
                ability: { header: "Ability Name", textAlign: "center" },
                castCount: { header: "Casts", textAlign: "center" }
            };

            const resourceTypes = new Set();

            for (const player of Object.values(this.players)) {
                for (const abilityData of Object.values(player.abilityDataByName)) {
                    for (const resource in abilityData.totalResourcesUsed) {
                        resourceTypes.add(resource);
                    }
                }
            }

            for (const resource of resourceTypes) {
                columns[resource] = { header: resource, textAlign: "center" };
                columns[`${resource}%`] = { header: `${resource}%`, textAlign: "center" };
            }

            return columns;
        }

        GetRows(columns) {
            const rows = [];

            for (const playerName in this.players) {
                const player = this.players[playerName];
                const totalResources = player.getTotalResourcesUsed();

                for (const abilityName in player.abilityDataByName) {
                    const abilityData = player.abilityDataByName[abilityName];
                    const row = {
                        actorName: playerName,
                        ability: `<AbilityIcon id="${this.AbilitiesUsed[abilityName].id}" icon="${this.AbilitiesUsed[abilityName].icon}" type="${this.AbilitiesUsed[abilityName].type}">${this.AbilitiesUsed[abilityName].name}</AbilityIcon>`,
                        castCount: abilityData.Casts
                    };

                    for (const resource in abilityData.totalResourcesUsed) {
                        const value = abilityData.totalResourcesUsed[resource] || 0;
                        const percentage = totalResources[resource]
                            ? Math.round((value / totalResources[resource]) * 100)
                            : 0;

                        row[resource] = value;
                        row[`${resource}%`] = percentage;
                    }

                    for (const column in columns) {
                        if (!(column in row)) {
                            row[column] = 0;
                        }
                    }

                    rows.push(row);
                }
            }

            return rows;
        }
    }

    class PlayerData {
        constructor() {
            this.abilityDataByName = {};
        }

        getTotalResourcesUsed() {
            const totalResources = {};

            for (const abilityData of Object.values(this.abilityDataByName)) {
                for (const resource in abilityData.totalResourcesUsed) {
                    totalResources[resource] =
                        (totalResources[resource] || 0) + abilityData.totalResourcesUsed[resource];
                }
            }

            return totalResources;
        }

        AddCastEvent(event) {
            if (event.ability) {
                if (!this.abilityDataByName[event.ability.name]) {
                    this.abilityDataByName[event.ability.name] = new AbilityData(event.ability.name);
                }

                this.abilityDataByName[event.ability.name].AddCastEvent(event);
            }
        }
    }

    class AbilityData {
        constructor(name) {
            this.totalResourcesUsed = {};
            this.Casts = 0;
            this.events = [];
            debug.addMessage(`CastEvents ${name}`, this.events);
            this.Name = name;
        }

        AddCastEvent(event) {
            if (event.sourceResources) {
                this.events.push(event);
                this.Casts++;
                this.ParseClassResource(event.sourceResources);
            }
        }

        ParseClassResource(sourceResources) {
            if (sourceResources.resourceType === 0 || !sourceResources.resourceType) {
                const resourceName = getResourceTypeName(sourceResources.resourceType);
                this.totalResourcesUsed[resourceName] =
                    (this.totalResourcesUsed[resourceName] || 0) + sourceResources.resourceCost;

                if (sourceResources.additionalResources) {
                    this.ParseAdditionalResources(sourceResources.additionalResources);
                }
            }
        }

        ParseAdditionalResources(additionalResources) {
            if (additionalResources.resourceType) {
                const resourceName = getResourceTypeName(additionalResources.resourceType);
                this.totalResourcesUsed[resourceName] =
                    (this.totalResourcesUsed[resourceName] || 0) + additionalResources.resourceAmount;

                if (additionalResources.next) {
                    this.ParseAdditionalResources(additionalResources.next);
                }
            }
        }
    }

    globalThis.getComponent = PowerUsageTable;
})();