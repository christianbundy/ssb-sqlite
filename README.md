# SSB SQLite

A small DIY implementation at throwing SSB data into SQLite.

## Prerequities

First off, you need to dump your SSB data into a file.

```sh
ssb createLogStream | jq -c > log.jsonl
```

This creates a huge file where each line is a JSON message. Reading this ends
up being **fast and easy** in most programming languages, which is what we're
aiming for.

## Performance

Just reading from JSONL file:

```
Time (mean ± σ):      4.839 s ±  0.065 s    [User: 3.725 s, System: 1.593 s]
Range (min … max):    4.768 s …  4.975 s    10 runs
```

Reading fro the JSONL file and passing through `JSON.parse()`:

```
Time (mean ± σ):     10.115 s ±  0.182 s    [User: 8.900 s, System: 1.773 s]
Range (min … max):    9.894 s … 10.429 s    10 runs
```

