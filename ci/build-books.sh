#!/bin/bash

set -ex

BASE_URL="https://lotabout.me"
MDBOOK_URL="https://github.com/rust-lang/mdBook/releases/download/v0.4.1/mdbook-v0.4.1-x86_64-unknown-linux-gnu.tar.gz"
FIX_CJK_SPACING_PLUGIN_URL="https://github.com/lotabout/mdbook-fix-cjk-spacing/releases/download/v0.1.1/mdbook-fix-cjk-spacing-v0.1.1-x86_64-unknown-linux-gnu.tar.gz"

DIR=$(cd `dirname $0`; pwd)
TOPDIR=$DIR/..
PUBLIC_DIR=$TOPDIR/public
TARGET_DIR=$PUBLIC_DIR/books

# ensure folder in publish folder
if [ ! -d $TARGET_DIR ]; then
    mkdir -p $TARGET_DIR
fi

#==============================================================================
# build books

cd $DIR
export PATH="$DIR:$PATH"
wget $MDBOOK_URL
tar xf $(basename $MDBOOK_URL)
wget $FIX_CJK_SPACING_PLUGIN_URL
tar xf $(basename $FIX_CJK_SPACING_PLUGIN_URL)

cd $TOPDIR
for book in $(find books -type d -mindepth 1 -maxdepth 1); do
    echo "Building $book"
    cd $TOPDIR/$book
    mdbook build

    echo "copy to publish folder"
    BOOK_NAME=$(basename $book)
    if [ -d $TARGET_DIR/$BOOK_NAME ]; then
        rm -rf $TARGET_DIR/$BOOK_NAME
    fi
    mv book $TARGET_DIR/$BOOK_NAME
done

#==============================================================================
# generating sitemap
cd $PUBLIC_DIR
BOOK_SITEMAP_NAME=sitemap-books.xml
BOOK_SITEMAP_FILE=$PUBLIC_DIR/$BOOK_SITEMAP_NAME

# write sitemap header
cat << EOF > $BOOK_SITEMAP_FILE
<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="sitemap.xsl"?>
<urlset xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd" xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
EOF

# write sitemap entries
for html in $(find . -name "*.html" | grep -v '404\|print'); do
    cat <<  EOF >> $BOOK_SITEMAP_FILE
    <url>
        <loc>$BASE_URL/${html/\.\/}</loc>
        <lastmod>$(date +"%Y-%m-%dT%H:%M:%S%z")</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.6</priority>
    </url>
EOF
done

cat << EOF >> $BOOK_SITEMAP_FILE
</urlset>
EOF

#==============================================================================
# add sitemap to global sitemap.xml (using GNU sed)
SITE_MAP_FILE=$PUBLIC_DIR/sitemap.xml
CONTENT=$(cat << EOF | sed ':a;N;$!ba;s/\n/\\n/g'
    <sitemap>
        <loc>$BASE_URL/$BOOK_SITEMAP_NAME</loc>
        <lastmod>$(date +"%Y-%m-%dT%H:%M:%S%z")</lastmod>
    </sitemap>
EOF
)
sed -i "s|</sitemapindex>|${CONTENT}\n</sitemapindex>|" $SITE_MAP_FILE
