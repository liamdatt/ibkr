FROM eclipse-temurin:17-jre
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip && rm -rf /var/lib/apt/lists/*
WORKDIR /gw
RUN curl -fsSL -o /tmp/gw.zip https://download2.interactivebrokers.com/portal/clientportal.gw.zip \
  && unzip -q /tmp/gw.zip -d /gw && rm /tmp/gw.zip && chmod +x bin/run.sh
COPY conf.yaml root/conf.yaml
RUN useradd --create-home gateway && chown -R gateway /gw
USER gateway
EXPOSE 5000
CMD ["bin/run.sh", "root/conf.yaml"]
