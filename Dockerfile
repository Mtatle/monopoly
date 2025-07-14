FROM python:3.6

# Set work directory
WORKDIR /app

# Install dependencies
COPY requirement.txt /app/
RUN pip install --upgrade pip && pip install -r requirement.txt

# Copy project files
COPY . /app/

# Collect static files (optional, if you use collectstatic)
RUN python manage.py collectstatic --noinput || true

# Expose port
EXPOSE 8000

# Run the app
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]