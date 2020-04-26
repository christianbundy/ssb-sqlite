# SSB SQLite

A small DIY implementation at throwing SSB data into SQLite.

## Prerequities

First off, you need to dump your SSB data into a file.

```sh
ssb createLogStream | jq -c > log.jsonl
```

This creates a huge file where each line is a JSON message. Reading this ends
up being **fast and easy** in most programming languages, which is what we're
aiming for. We could consume directly from `createLogStream`, but that takes
10x longer than just reading a file.

## Performance

Just reading from JSONL file:

```
Time (mean ± σ):      4.839 s ±  0.065 s    [User: 3.725 s, System: 1.593 s]
Range (min … max):    4.768 s …  4.975 s    10 runs
```

Reading from the JSONL file and passing through `JSON.parse()`:

```
Time (mean ± σ):     10.115 s ±  0.182 s    [User: 8.900 s, System: 1.773 s]
Range (min … max):    9.894 s … 10.429 s    10 runs
```

Reading, parsing as JSON, and inserting into an in-memory instance of SQLite.

```
179 seconds
```

Reading, parsing as JSON, and inserting into a **persistent** SQLite file.

```
183 seconds
```

That's super fast, but doing it all in one transaction means that we have to
store everything in memory. If you have a fancy desktop computer that works
great, but low-resource devices like phones and Raspberry Pis don't like that.
Instead, we can write to the filesystem in batches. For example, 1024 at a
time:

```
Time (mean ± σ):     231.531 s ± 19.177 s    [User: 108.368 s, System: 10.284 s]
Range (min … max):   217.971 s … 245.091 s    2 runs
```

One problem is that we really don't want to have to re-read every message to
get common data, like what people want to call themselves. We can create a new
table for authors that has columns for the key, name, image, and description.

This slows us down a bit, but the indexing still finishes in ~4 minutes.

Once we've loaded all of the relevant data into SQLite, we can easily query it:

```console
$ sqlite3 ssb.db
sqlite> select count(*) from messages;
1161216
sqlite> select count(*) from authors;
16623
sqlite> select key from messages order by random() limit 1;
%fZp5XDsBvYNZ2NgvWrmd25/v9PT2DeGSnx55pq/vQOc=.sha256
sqlite> select name from authors order by random() limit 1;
patchfoo
```

## Acknowledgements

Most of the ideas in this module (and a large amount of code) came directly
from Cinnamon, who I've been really enjoying working with on this project (and
Oasis!). Please don't confuse the Git commit history with who has _actually_
been pouring time and energy into these ideas. ❤
