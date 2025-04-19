let getComponent;

(() => {
    "use strict";

    // Utility functions
    const LAVA_WAVE_ID = 403543;

    // Function to retrieve events by category and disposition
    function getEventsByCategoryAndDisposition(fight, category, disposition) {
        return fight.eventsByCategoryAndDisposition(category, disposition);
    }

    // Function to get class color based on class name
    function getClassColor(className) {
        switch (className) {
            case "DeathKnight": return "#C41E3A";
            case "DemonHunter": return "#A330C9";
            case "Druid": return "#FF7C0A";
            case "Evoker": return "#33937F";
            case "Hunter": return "#AAD372";
            case "Mage": return "#3FC7EB";
            case "Monk": return "#00FF98";
            case "Paladin": return "#F48CBA";
            case "Priest": return "#FFFFFF";
            case "Rogue": return "#FFF468";
            case "Shaman": return "#0070DD";
            case "Warlock": return "#8788EE";
            case "Warrior": return "#C69B6D";
            default: throw new Error("Unsupported class name");
        }
    }

    // Main component function
    const DiedToLavaWave = () => {
        const deathsInvolvingLavaWave = [];

        // Iterate through all fights in the report group
        for (const fight of reportGroup.fights) {
            // Skip fights that are not the specific encounter or are too short
            if (fight.encounterId !== 2680) continue;
            if (fight.endTime - fight.startTime < 45000) continue;

            // Get deaths and resurrects for friendly targets
            const events = getEventsByCategoryAndDisposition(fight, "deathsAndResurrects", "friendly");

            for (const event of events) {
                // Skip events that are not deaths or do not involve players
                if (event.type !== "death") continue;
                if (!event.target || event.target.type !== "Player") continue;
                if (event.isFeign) continue;
                if (!event.killer) continue;

                // Check if the death was caused by Lava Wave
                if (event.ability && event.ability.id === LAVA_WAVE_ID) {
                    deathsInvolvingLavaWave.push(event.target);
                    continue;
                }

                // Analyze events prior to death
                const priorEvents = fight.eventsPriorToDeath(event);
                let killingBlow = null;

                for (const priorEvent of priorEvents) {
                    // Skip if the target had high health before the killing blow
                    if (
                        killingBlow ||
                        (priorEvent.type === "damage" &&
                            priorEvent.target?.idInReport === event.target.idInReport &&
                            priorEvent.targetResources &&
                            priorEvent.targetResources.hitPoints / priorEvent.targetResources.maxHitPoints >= 0.95)
                    ) {
                        break;
                    }

                    // Check if Lava Wave was involved in the death
                    if (
                        priorEvent.type === "damage" &&
                        priorEvent.ability?.id === LAVA_WAVE_ID
                    ) {
                        if (killingBlow?.overkill && killingBlow.overkill >= priorEvent.amount) {
                            continue;
                        }
                        deathsInvolvingLavaWave.push(event.target);
                        break;
                    }

                    if (priorEvent.type === "damage") {
                        killingBlow = priorEvent;
                    }
                }
            }
        }

        // Aggregate death data by player
        const deathCounts = {};
        for (const player of deathsInvolvingLavaWave) {
            const playerName = player.name;
            if (deathCounts[playerName]) {
                deathCounts[playerName].y += 1;
            } else {
                deathCounts[playerName] = {
                    y: 1,
                    color: getClassColor(player.subType)
                };
            }
        }

        // Sort and prepare data for the chart
        const sortedDeaths = [];
        for (const playerName in deathCounts) {
            sortedDeaths.push([playerName, deathCounts[playerName]]);
        }
        sortedDeaths.sort((a, b) => b[1].y - a[1].y);

        const chartData = {};
        sortedDeaths.forEach(([playerName, data]) => {
            chartData[playerName] = data;
        });

        // Return the chart component
        return {
            component: "Chart",
            props: {
                chart: {
                    type: "column"
                },
                title: {
                    text: 'Deaths in which <AbilityIcon id={LAVA_WAVE_ID} icon="spell_shaman_lavasurge">Lava Wave</AbilityIcon> was involved'
                },
                xAxis: {
                    categories: Object.keys(chartData)
                },
                yAxis: {
                    min: 0,
                    title: {
                        text: "Death Count"
                    },
                    tickInterval: 1
                },
                series: [
                    {
                        name: "Deaths",
                        data: Object.values(chartData),
                        colorByPoint: true
                    }
                ]
            }
        };
    };

    // Export the component
    globalThis.getComponent = getComponent = DiedToLavaWave;
})();