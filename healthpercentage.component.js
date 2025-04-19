let getComponent;

(() => {
    "use strict";

    // Utility function to create an error component
    function createErrorComponent(title, message) {
        return {
            component: "EnhancedMarkdown",
            props: {
                content: `\n# ${title}\n${message}\n`
            }
        };
    }

    // Utility function to handle and log exceptions
    function handleException(error, title) {
        const stackLines = error.stack?.split("\n");
        const errorLocation = stackLines?.[1]?.trim();

        return createErrorComponent(
            title,
            `An unexpected error occurred: ${error.message || error}\n\nLocation: ${errorLocation || "Unknown"}`
        );
    }

    // Main component function
    const HealthPercentageTracker = () => {
        try {
            const title = "Health Percentage Tracker";

            // Validate that only one fight and one player are selected
            const onlyOneFightSelected = reportGroup.fights.length === 1;
            const onlyOneCombatantInfoEvent =
                reportGroup.fights[0]?.combatantInfoEvents?.length === 1;

            if (!onlyOneFightSelected || !onlyOneCombatantInfoEvent) {
                return createErrorComponent(
                    title,
                    `Validation failed: 
                    - Only one fight selected: ${onlyOneFightSelected}
                    - Only one combatant info event: ${onlyOneCombatantInfoEvent}`
                );
            }

            // Get the selected fight and player
            const fight = reportGroup.fights[0];
            const player = fight.combatantInfoEvents[0]?.source;

            // Validate the player object and its idInReport property
            if (!player || player.type !== "Player") {
                return createErrorComponent(
                    title,
                    `Invalid player data: ${JSON.stringify(player)}`
                );
            }

            if (!player.idInReport || typeof player.idInReport !== "number") {
                return createErrorComponent(
                    title,
                    `Invalid or missing player ID. Player details: ${JSON.stringify(player)}`
                );
            }

            // Validate category and disposition before calling eventsByCategoryAndDisposition
            const validCategories = [
                "DamageDone",
                "DamageTaken",
                "Healing",
                "Buffs",
                "Debuffs",
                "Casts",
                "Resources",
                "Deaths",
                "Threat"
            ];
            const validDispositions = ["friendly", "hostile", "neutral"];

            // Validate the category
            if (!validCategories.includes("Healing")) {
                return createErrorComponent(
                    title,
                    `Invalid category: "Healing". Valid categories are: ${validCategories.join(", ")}`
                );
            }

            // Validate the disposition
            if (!validDispositions.includes("friendly")) {
                return createErrorComponent(
                    title,
                    `Invalid disposition: "friendly". Valid dispositions are: ${validDispositions.join(", ")}`
                );
            }

            // Retrieve health events for the player
            let healthEvents;
            try {
                healthEvents = fight.eventsByCategoryAndDisposition("Healing", "friendly");
            } catch (error) {
                return createErrorComponent(
                    title,
                    `Error retrieving events: ${error.message || error}`
                );
            }

            // Check if healthEvents is valid
            if (!Array.isArray(healthEvents) || healthEvents.length === 0) {
                return createErrorComponent(
                    title,
                    `No health data available for the selected player. Player ID: ${player.idInReport}, Health events: ${JSON.stringify(healthEvents)}`
                );
            }

            // Calculate time spent above and below 80% health
            let timeAbove80 = 0;
            let timeBelow80 = 0;
            let previousTimestamp = fight.startTime;

            for (const event of healthEvents) {
                // Validate the event data
                if (
                    typeof event.timestamp !== "number" ||
                    !event.targetResources ||
                    typeof event.targetResources.hitPoints !== "number" ||
                    typeof event.targetResources.maxHitPoints !== "number" ||
                    event.targetResources.maxHitPoints === 0
                ) {
                    // Skip invalid events
                    continue;
                }

                const currentTimestamp = event.timestamp;
                const healthPercentage =
                    (event.targetResources.hitPoints / event.targetResources.maxHitPoints) * 100;

                if (healthPercentage > 80) {
                    timeAbove80 += currentTimestamp - previousTimestamp;
                } else {
                    timeBelow80 += currentTimestamp - previousTimestamp;
                }

                previousTimestamp = currentTimestamp;
            }

            // Account for remaining time after the last event
            const fightDuration = fight.endTime - fight.startTime;
            if (fightDuration <= 0) {
                return createErrorComponent(title, `Invalid fight duration: ${fightDuration}`);
            }

            const remainingTime = Math.max(0, fightDuration - (timeAbove80 + timeBelow80));

            if (remainingTime > 0) {
                const lastHealthPercentage =
                    (healthEvents[healthEvents.length - 1].targetResources?.hitPoints /
                        healthEvents[healthEvents.length - 1].targetResources?.maxHitPoints) *
                    100;

                if (lastHealthPercentage > 80) {
                    timeAbove80 += remainingTime;
                } else {
                    timeBelow80 += remainingTime;
                }
            }

            // Calculate percentages
            const percentAbove80 = ((timeAbove80 / fightDuration) * 100).toFixed(2);
            const percentBelow80 = ((timeBelow80 / fightDuration) * 100).toFixed(2);

            // Return the result as a Table component for better readability
            return {
                component: "Table",
                props: {
                    columns: {
                        title: {
                            header: `**${title} for ${player.name}**`,
                            columns: {
                                above80: { header: "Time Above 80% Health (%)" },
                                below80: { header: "Time Below 80% Health (%)" }
                            }
                        }
                    },
                    data: [
                        {
                            above80: percentAbove80,
                            below80: percentBelow80
                        }
                    ]
                }
            };
        } catch (error) {
            return handleException(error, "Health Percentage Tracker");
        }
    };

    // Export the component
    globalThis.getComponent = getComponent = HealthPercentageTracker;
})();