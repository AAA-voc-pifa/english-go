docker exec -i pro-db-1 sh -c '
  mongodump --uri="mongodb://old-data/english-go" --archive --gzip \
  | mongorestore --uri="mongodb://localhost:27017/english-go" --archive --gzip --drop
'