# We put OurProvisions in real hands. Here's what the list taught us.

*July 2026 · from the boat*

A month ago, OurProvisions was a good idea with a working login. This month it's on real phones, in real kitchens, syncing real grocery lists between real people who share a home. That shift — from "it runs" to "someone I love is using it to shop" — changes everything you thought you knew about what you were building.

Here's where we are, what's working, and the one thing watching people use it taught us about the actual problem.

## The problem isn't remembering the milk. It's the two of you.

We didn't set out to build a to-do list with groceries in it. There are plenty of those. What kept coming up — first in our own kitchen, then with our first testers — is that a household grocery list is never really *one* person's list. It's shared, and the sharing is where every existing app quietly falls apart.

You add oat milk. Your partner, at a different store, is looking at the same list a second later. They check it off. Did it save? Did it save for *both* of you, or just them? Who added the thing neither of you remembers wanting? The moment more than one person touches a list, "did that change actually happen" becomes the whole game — and most apps treat it as an afterthought.

So that became our real problem statement, and it's why we called it *provisions* and not *groceries*. When you stock a boat, you can't run back to the store. Space is limited, you need the right amount, and more than one person is responsible for getting it right. That discipline — plan well, waste less, get it right together — is what we're bringing home to the kitchen. The shared list is sacred. That's the bar.

## What's ready right now

Watching two first-time users shop on it this month, a few things earned their place:

**A living, shared household list.** You and the people you live with are on the same list, and changes move between you in near-real-time. This is the foundation everything else sits on — and getting collaborative editing to feel trustworthy is most of the work. Most of what we shipped this month is in service of that word: *trustworthy*.

**Browse, then build your list.** Add an item and it turns into a clean quantity stepper — tap up, tap down, done. Take it back to zero and it collapses to a single "Add" button, so there's never a confusing "0" sitting on your list. Small thing. It's the kind of small thing the whole app is made of.

**A one-tap declutter.** Long lists get noisy mid-shop. One control cycles your view: everything grouped by aisle, then the same view with the checked-off stuff hidden so you can see what's left, then a flat A–Z when you're just hunting for one thing. It's a single button doing three jobs, and it stays out of your way until you want it.

**Invite someone aboard.** From inside the app you can hand the list to the person you shop with — a real share, straight into their messages, not a copy-paste dance. This is the one that matters most to us, and I'll explain why below.

**Staples that stick.** Mark the things your household always needs. They persist per-household, so your list learns your baseline without leaking into anyone else's.

## What watching real people taught us

You can't design your way to this part. You have to watch.

The single most encouraging thing that happened this month: one of our testers, unprompted and on his first try, invited a *second* person into his household. Nobody told him to. He just did it, because the app made sense as a shared thing. That's the entire thesis of what we're building firing off in the wild — the value isn't the app, it's the people you connect through it.

And the humbling part: another tester waited for a "download" that was never coming, because the app installs straight from the web and we hadn't told him that clearly enough. Five words of copy at the right moment would have saved him the wait. That's not a bug in the code — it's a gap in the welcome, and it's exactly the kind of thing you only find by handing someone your phone and shutting up.

We also caught a cluster of sync bugs — check one item and its duplicate would check too; a toggle that didn't stick until the third tap. Unglamorous, invisible until you're two people on one list, and precisely the things that decide whether a shared list feels solid or flaky. We traced every one of them to a single root cause this week, and they're the top of the fix pile. On a shared list, that trust *is* the product.

## Why this is the entry point, not the whole story

OurProvisions is app one. The reason a household picks something universal — everyone needs to eat — is that it's the lowest-friction way to get the people who matter connected in one place. Once your people are there, everything we build next is already easier, because the hardest part of any app (getting your circle together) is already done.

But that's a story for another post. Right now, the job is a grocery list that two people can trust. We're most of the way there, and the last stretch is the stuff you can only learn by watching.

If you want to be one of the people who shapes it — come aboard. The list is better with more hands on it.

*Live Better. Live Smarter.*
