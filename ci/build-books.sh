#!/bin/bash

set -ex

DIR=$(cd `dirname $0`; pwd)
TOPDIR=$DIR/..
TARGET_DIR=$TOPDIR/public/books

# ensure folder in publish folder
if [ ! -d $TARGET_DIR ]; then
    mkdir -p $TARGET_DIR
fi

for book in $(find books -type d -mindepth 1 -maxdepth 1); do
    echo "Building $book"
    cd $TOPDIR/$book
    npm install
    gitbook install
    gitbook build

    echo "copy to publish folder"
    BOOK_NAME=$(basename $book)
    if [ -d $TARGET_DIR/$BOOK_NAME ]; then
        rm -rf $TARGET_DIR/$BOOK_NAME
    fi
    mv _book $TARGET_DIR/$BOOK_NAME
done
