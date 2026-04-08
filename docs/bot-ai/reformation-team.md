# Reformation team bot algorithm

This note describes the current bot logic for **Reformation** team decisions.

## Goals
- pick a starting allegiance that creates the best attack surface
- use **Convert** to improve target access and team shape
- avoid ending up stranded as the only living member of an allegiance unless the tactical payoff is clearly worth it

## Starting allegiance
When the first player must choose a starting allegiance, the bot simulates both:
- `Loyalist`
- `Reformist`

For each simulated seating assignment it scores:
- `+danger` for each living opponent on the opposite allegiance
- `-0.6 * danger` for each living player on the same allegiance
- `+4` if an opposite-allegiance opponent already has `>= 7` coins
- `+3` if an opposite-allegiance opponent becomes a legal target for one of the bot's aggressive cards (`Assassinate`, `Steal`, `Examine`)

The bot picks the higher score. Ties are randomized.

## Convert scoring
For each legal Convert target, the bot simulates the post-convert board and starts with:
- `-1` cost for self-convert
- `-2` cost for converting another player

Then it adds or subtracts target-access value:
- `+danger` when a player becomes newly targetable by `Coup`
- an extra `+4` when that newly targetable player has `>= 7` coins
- `-danger` when a previously targetable player stops being targetable

## Team-balance adjustments
After the base targetability score, the bot applies Reformation team-shape heuristics.

### Avoid stranding itself
If the simulated convert would leave the bot as the **only living player** on its allegiance while the opposite allegiance still has **2 or more** living players:
- apply a **large penalty**

This is the main guardrail that stops bots from making flashy but strategically bad converts.

### Prefer having support
If the convert gives the bot at least one living teammate:
- add a bonus
- add a larger bonus when the bot was previously alone and the convert creates support

### Prefer isolating the converted target
If converting another player makes that converted player the **sole living member** of their allegiance while the bot still has support:
- add a bonus

## Selection rule
After scoring all legal convert targets, the bot:
1. sorts by highest score
2. prefers self-convert on ties
3. only chooses Convert when the best score is at least the normal Convert threshold

## Examples
### Example 1: avoid stranding itself
- Bot + ally are `Loyalist`
- two enemies are `Reformist`
- converting the ally would make the bot the only `Loyalist`

Even if that convert opens a strong target, the anti-stranding penalty should usually make the bot reject it.

### Example 2: self-convert to join support
- Bot is the only `Loyalist`
- two `Reformist` players are alive
- a high-danger `Loyalist` opponent exists

Self-convert can be good here because it joins the larger team instead of leaving the bot isolated, while still changing target access.
