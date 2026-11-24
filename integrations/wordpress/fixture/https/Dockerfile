FROM php:8.4-fpm-bookworm
RUN apt-get update \
    && apt-get install -y --no-install-recommends libcurl4-openssl-dev \
    && docker-php-ext-install mysqli curl \
    && rm -rf /var/lib/apt/lists/*
COPY zz-fixture.conf /usr/local/etc/php-fpm.d/zz-fixture.conf
